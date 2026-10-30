//! Import at start, the check command and compact under a backup pause.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use chassis::shell::backup::{Controller, Mode};
use chassis::storage::{AppDb, AppDbSpec, DataKind, ImportReport, ImportState, TimeFormat};
use chassis::testing::TestApp;
use chassis::{App, Control};

use crate::fixtures::{SERIAL, refused, schema, spec};

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_failed_import_keeps_the_service_up_with_a_problem_and_the_old_files() {
    let _one = SERIAL.lock().await;
    let handle: Arc<Mutex<Option<AppDb>>> = Arc::default();
    let h2 = handle.clone();
    let mut app = TestApp::start_with(spec("imp"), Router::new(), move |app| {
        let db = app
            .app_db(AppDbSpec::new(schema()).with_import(|tx, ctx| {
                tx.execute("INSERT INTO blobs (at, data) VALUES (0, x'00')", [])?;
                std::fs::write(ctx.state_dir.join("legacy.json"), b"{}").ok();
                Err(chassis::Error::dependency(
                    "legacy.json is torn",
                    "restore it from the backup",
                ))
            }))
            .unwrap();
        *h2.lock().unwrap() = Some(db);
    })
    .await;
    let db = handle.lock().unwrap().clone().unwrap();
    assert!(matches!(db.import_state(), ImportState::Failed { .. }));
    app.login().await;
    let (status, body) = app.get_json("/api/kit/status").await;
    assert_eq!(status, 200, "the service runs: {body}");
    let problems = body["problems"].to_string();
    assert!(problems.contains("one-time import"), "{problems}");
    assert!(problems.contains("old files"), "{problems}");
    let n: i64 = db
        .read(|c| Ok(c.query_row("SELECT count(*) FROM blobs", [], |r| r.get(0))?))
        .await
        .unwrap();
    assert_eq!(
        n, 0,
        "the row written inside the import transaction is gone"
    );
    assert!(
        app.state_dir().join("legacy.json").exists(),
        "old files stay"
    );
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_good_import_at_start_renames_the_old_files() {
    let _one = SERIAL.lock().await;
    let mut app = TestApp::start_with(spec("imp2"), Router::new(), |app| {
        app.app_db(AppDbSpec::new(schema()).with_import(|tx, ctx| {
            let old = ctx.state_dir.join("legacy.json");
            std::fs::write(&old, b"[1,2]").unwrap();
            tx.execute(
                "INSERT INTO blobs (at, data) VALUES (0, x'01'), (0, x'02')",
                [],
            )?;
            Ok(ImportReport::new(2, 2, vec![old]))
        }))
        .unwrap();
    })
    .await;
    assert!(!app.state_dir().join("legacy.json").exists());
    assert!(app.state_dir().join("legacy.json.migrated").exists());
    app.shutdown().await;
}

/// Declared kinds are validated when the service starts.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_kind_that_does_not_match_the_schema_stops_the_start() {
    let _one = SERIAL.lock().await;
    let err = refused(spec("badkind"), &[], |app| {
        app.app_db(AppDbSpec::new(schema())).unwrap();
        app.storage_kind(DataKind::new("ghosts", "Ghosts").table("ghosts"));
    })
    .await;
    assert!(err.contains("no table `ghosts`"), "{err}");
    let err = refused(spec("nodb"), &[], |app| {
        app.storage_kind(DataKind::new("a", "A").table("blobs"));
    })
    .await;
    assert!(err.contains("no app database"), "{err}");
}

/// `--check` looks at the file read-only: it creates nothing, reports a
/// file that is behind, and refuses one from a newer build.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn check_inspects_the_app_database_and_refuses_a_newer_one() {
    let _one = SERIAL.lock().await;
    let dir = tempfile::tempdir().unwrap();
    let env: BTreeMap<String, String> = [
        ("CHK_TOKEN".to_string(), "t".repeat(32)),
        ("CHK_SECRET_KEY".to_string(), "ab".repeat(32)),
        (
            "CHK_PUBLIC_URL".to_string(),
            "https://chk.example".to_string(),
        ),
    ]
    .into();
    let argv = vec![
        "chk".to_string(),
        "--check".to_string(),
        "--state-dir".to_string(),
        dir.path().display().to_string(),
        "--listen".to_string(),
        "127.0.0.1:0".to_string(),
    ];
    let mut app =
        App::from_args_with_env(spec("chk"), argv.clone(), env.clone(), Router::new()).unwrap();
    assert!(matches!(app.control, Some(Control::Check)));
    app.app_db(AppDbSpec::new(schema())).unwrap();
    app.control().await.unwrap();
    assert!(
        !dir.path().join("chk.db").exists(),
        "--check creates nothing"
    );

    // A database from a newer build.
    drop(AppDb::open(&dir.path().join("chk.db"), AppDbSpec::new(schema()), vec![]).unwrap());
    let conn = chassis::storage::rusqlite::Connection::open(dir.path().join("chk.db")).unwrap();
    conn.execute_batch("PRAGMA user_version = 9").unwrap();
    drop(conn);
    let mut app = App::from_args_with_env(spec("chk"), argv, env, Router::new()).unwrap();
    app.app_db(AppDbSpec::new(schema())).unwrap();
    let err = app.control().await.unwrap_err();
    assert!(err.message.contains("newer build"), "{err}");
    assert!(err.remedy.contains("pre-update copy"), "{err}");
}

/// A pause refuses the VACUUM: rewriting the whole file is what the backup
/// must not see. After the resume it runs.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn compact_is_refused_while_a_backup_pause_holds_the_state() {
    let _one = SERIAL.lock().await;
    let dir = tempfile::tempdir().unwrap();
    let app = AppDb::open(
        &dir.path().join("a.db"),
        AppDbSpec::new(schema()),
        vec![
            DataKind::new("blobs", "Blobs")
                .table("blobs")
                .time_column("at", TimeFormat::UnixSeconds),
        ],
    )
    .unwrap();
    let controller = Controller::new(vec![], vec![]);
    controller
        .pause(Duration::from_secs(30), Mode::Writes)
        .await
        .unwrap();
    assert!(app.compact_preview().unwrap().paused);
    let err = app.compact().unwrap_err();
    assert!(err.message.contains("paused for a backup"), "{err}");
    controller.resume("test").await;
    app.compact().unwrap();
}
