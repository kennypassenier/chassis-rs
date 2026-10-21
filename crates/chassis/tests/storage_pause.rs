//! The backup pause and sqlite (3.11.0): writes drain, the logs are
//! checkpointed, a busy checkpoint refuses the pause (so `backup-pause`
//! stops the unit instead), and the files are listed in the pause's paths.
//! One test binary on purpose: the pause gate is process-global.
#![cfg(all(feature = "testing", feature = "storage"))]

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::Router;
use chassis::AppSpec;
use chassis::shell::backup::{Controller, Mode, PauseError, is_paused};
use chassis::storage::{Db, Migration, pause_hook, rusqlite, wal_path};
use chassis::testing::TestApp;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn schema() -> Vec<Migration> {
    vec![Migration::sql(
        "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL) STRICT;",
    )]
}

fn count(db: &Db) -> i64 {
    db.read_blocking(|c| Ok(c.query_row("SELECT count(*) FROM t", [], |r| r.get(0))?))
        .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_pause_waits_for_a_write_in_flight_then_checkpoints_the_log() {
    let _one = SERIAL.lock().await;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("app.db");
    let db = Db::open(&path, &schema()).unwrap();
    let controller = Controller::new(vec![pause_hook(vec![db.clone()])], vec![]);

    // A slow write holds its ticket for ~300 ms.
    let slow = db.clone();
    let started = Instant::now();
    let write = tokio::spawn(async move {
        slow.write(|tx| {
            tx.execute("INSERT INTO t (v) VALUES ('in flight')", [])?;
            std::thread::sleep(Duration::from_millis(300));
            Ok(())
        })
        .await
        .unwrap();
    });
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert!(
        std::fs::metadata(wal_path(&path)).is_ok_and(|m| m.len() > 0) || count(&db) == 0,
        "the log is in use while the file is live"
    );

    controller
        .pause(Duration::from_secs(30), Mode::Writes)
        .await
        .expect("pause");
    assert!(
        started.elapsed() >= Duration::from_millis(250),
        "the pause answered only after the write came back: {:?}",
        started.elapsed()
    );
    write.await.unwrap();
    assert!(is_paused());
    // The write is in the file itself and the log is empty: a plain copy
    // of the state directory now restores.
    assert_eq!(db.sizes().unwrap().wal_bytes, 0, "the log was truncated");
    let copy = dir.path().join("copy.db");
    std::fs::copy(&path, &copy).unwrap();
    let plain = rusqlite::Connection::open(&copy).unwrap();
    let n: i64 = plain
        .query_row("SELECT count(*) FROM t", [], |r| r.get(0))
        .unwrap();
    assert_eq!(
        n, 1,
        "the in-flight write is in the main file, not only in the log"
    );

    // A write while paused waits...
    let blocked = tokio::time::timeout(
        Duration::from_millis(300),
        db.write(|tx| Ok(tx.execute("INSERT INTO t (v) VALUES ('held')", [])?)),
    )
    .await;
    assert!(blocked.is_err(), "a write waits for the resume");
    // ...and goes through after it.
    controller.resume("test").await;
    assert!(!is_paused());
    db.write(|tx| Ok(tx.execute("INSERT INTO t (v) VALUES ('after')", [])?))
        .await
        .unwrap();
    assert_eq!(count(&db), 2, "the abandoned write never happened");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn both_files_are_checkpointed() {
    let _one = SERIAL.lock().await;
    let dir = tempfile::tempdir().unwrap();
    let a = Db::open(&dir.path().join("a.db"), &schema()).unwrap();
    let b = Db::open(&dir.path().join("a-kit.db"), &schema()).unwrap();
    for db in [&a, &b] {
        db.write_blocking(|tx| Ok(tx.execute("INSERT INTO t (v) VALUES ('x')", [])?))
            .unwrap();
        assert!(db.sizes().unwrap().wal_bytes > 0);
    }
    let controller = Controller::new(vec![pause_hook(vec![a.clone(), b.clone()])], vec![]);
    controller
        .pause(Duration::from_secs(30), Mode::Writes)
        .await
        .unwrap();
    assert_eq!(a.sizes().unwrap().wal_bytes, 0);
    assert_eq!(b.sizes().unwrap().wal_bytes, 0);
    controller.resume("test").await;
}

/// A reader that never lets go of the log makes the TRUNCATE checkpoint
/// busy; the hook errors, the pause is refused and nothing stays held, which
/// is what makes `backup-pause` fall back to stopping the unit.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_busy_checkpoint_refuses_the_pause_and_holds_nothing() {
    let _one = SERIAL.lock().await;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("app.db");
    let db = Db::open(&path, &schema()).unwrap();
    db.set_busy_timeout(Duration::from_millis(150)).unwrap();
    db.write_blocking(|tx| Ok(tx.execute("INSERT INTO t (v) VALUES ('a')", [])?))
        .unwrap();

    // A foreign reader pins an old snapshot of the log.
    let reader = rusqlite::Connection::open(&path).unwrap();
    reader
        .execute_batch("BEGIN; SELECT count(*) FROM t;")
        .unwrap();
    db.write_blocking(|tx| Ok(tx.execute("INSERT INTO t (v) VALUES ('b')", [])?))
        .unwrap();

    let resumed = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let r2 = resumed.clone();
    let controller = Controller::new(
        vec![pause_hook(vec![db.clone()])],
        vec![Arc::new(move || {
            r2.store(true, std::sync::atomic::Ordering::SeqCst)
        })],
    );
    let started = Instant::now();
    let err = controller
        .pause(Duration::from_secs(30), Mode::Writes)
        .await
        .expect_err("busy log refuses the pause");
    assert!(
        matches!(&err, PauseError::Hook(why) if why.contains("checkpoint")),
        "{err:?}"
    );
    assert!(
        started.elapsed() < Duration::from_secs(4),
        "the test busy timeout applied"
    );
    assert!(!is_paused(), "a refused pause leaves nothing held");
    assert!(
        resumed.load(std::sync::atomic::Ordering::SeqCst),
        "resume hooks ran"
    );
    // Once the reader lets go the same pause succeeds.
    reader.execute_batch("COMMIT").unwrap();
    controller
        .pause(Duration::from_secs(30), Mode::Writes)
        .await
        .unwrap();
    controller.resume("test").await;
}

async fn socket(name: &str, line: &str) -> String {
    let path = chassis::shell::backup::server_socket_path(name);
    let mut s = tokio::net::UnixStream::connect(path).await.unwrap();
    s.write_all(format!("{line}\n").as_bytes()).await.unwrap();
    let mut out = String::new();
    s.read_to_string(&mut out).await.unwrap();
    out
}

/// The running service: a registered database outside the state root joins
/// the pause's paths, the pause checkpoints it, and the state root (which
/// holds the kit's and the app's files) is listed.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_registered_database_is_listed_and_checkpointed_by_the_running_service() {
    let _one = SERIAL.lock().await;
    let elsewhere = tempfile::tempdir().unwrap();
    let db = Db::open(&elsewhere.path().join("side.db"), &schema()).unwrap();
    db.write_blocking(|tx| Ok(tx.execute("INSERT INTO t (v) VALUES ('x')", [])?))
        .unwrap();
    assert!(db.sizes().unwrap().wal_bytes > 0);
    let spec = AppSpec {
        name: "pausedb",
        version: "0.0.0",
        ..Default::default()
    };
    let d2 = db.clone();
    let mut app = TestApp::start_with(spec, Router::new(), move |app| {
        app.backup_db(&d2);
    })
    .await;
    let state = app.state_dir().display().to_string();
    let answer = socket("pausedb", "pause 30").await;
    assert!(answer.starts_with("paused "), "{answer}");
    assert!(
        answer.contains(&state),
        "the state root is listed: {answer}"
    );
    assert!(
        answer.contains(&elsewhere.path().display().to_string()),
        "the database's own directory is listed: {answer}"
    );
    assert_eq!(
        db.sizes().unwrap().wal_bytes,
        0,
        "the pause checkpointed it"
    );
    assert_eq!(socket("pausedb", "resume").await.trim(), "resumed");
    app.shutdown().await;
}
