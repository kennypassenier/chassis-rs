//! The app database through a running service (3.11.0): the budget that
//! only warns, the status-page problem and the metrics, the one-time import
//! at start, the daily finished-rows rule, `--check`, and compact refused
//! while a backup pause holds the state.
#![cfg(all(feature = "testing", feature = "storage"))]

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use chassis::shell::backup::{Controller, Mode};
use chassis::storage::{
    AppDb, AppDbSpec, DataKind, ImportReport, ImportState, Migration, TimeFormat,
};
use chassis::testing::TestApp;
use chassis::{App, AppSpec, Control};

static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn schema() -> Vec<Migration> {
    vec![Migration::sql(
        "CREATE TABLE blobs (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, data BLOB NOT NULL) STRICT;
         CREATE TABLE snoozes (id INTEGER PRIMARY KEY, until INTEGER NOT NULL) STRICT;",
    )]
}

fn spec(name: &'static str) -> AppSpec {
    AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    }
}

/// Start and return the kit's refusal.
async fn refused(spec: AppSpec, env: &[(&str, &str)], configure: impl FnOnce(&mut App)) -> String {
    match TestApp::try_start_with_env(spec, Router::new(), env, configure).await {
        Ok(mut app) => {
            app.shutdown().await;
            panic!("the service started but should have been refused");
        }
        Err(e) => e.to_string(),
    }
}

/// An app database whose import writes `mb` megabytes at the first start.
fn big_import(mb: usize) -> AppDbSpec {
    AppDbSpec {
        migrations: schema(),
        import: Some(Box::new(move |tx, _| {
            for _ in 0..mb {
                tx.execute(
                    "INSERT INTO blobs (at, data) VALUES (0, zeroblob(1048576))",
                    [],
                )?;
            }
            Ok(ImportReport {
                expected: mb as u64,
                imported: mb as u64,
                files: vec![],
            })
        })),
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn past_the_warn_line_the_status_page_metrics_and_hook_say_so_but_no_write_is_refused() {
    let _one = SERIAL.lock().await;
    let warns = Arc::new(AtomicUsize::new(0));
    let handle: Arc<Mutex<Option<AppDb>>> = Arc::default();
    let (w2, h2) = (warns.clone(), handle.clone());
    let mut app = TestApp::start_with_env(
        spec("budgeted"),
        Router::new(),
        &[
            ("BUDGETED_STORAGE_BUDGET_MB", "1"),
            ("BUDGETED_STORAGE_WARN_MB", "1"),
        ],
        move |app| {
            let db = app.app_db(big_import(3)).unwrap();
            *h2.lock().unwrap() = Some(db);
            app.on_storage_warn(move |report| {
                assert_eq!(report.budget_bytes, 1024 * 1024);
                w2.fetch_add(1, Ordering::SeqCst);
            });
        },
    )
    .await;
    assert_eq!(
        warns.load(Ordering::SeqCst),
        1,
        "the hook ran once at the first check"
    );
    app.login().await;
    let (status, body) = app.get_json("/api/kit/status").await;
    assert_eq!(status, 200, "{body}");
    let problems = body["problems"].to_string();
    assert!(problems.contains("storage is"), "{problems}");
    assert!(problems.contains("nothing is refused"), "{problems}");
    // /metrics
    let (status, text) = TestApp::send_text(app.request(reqwest::Method::GET, "/metrics")).await;
    assert_eq!(status, 200);
    assert!(
        text.contains("budgeted_storage_bytes{file=\"app\"}"),
        "{text}"
    );
    assert!(
        text.contains("budgeted_storage_budget_bytes 1048576"),
        "{text}"
    );
    assert!(
        text.contains("budgeted_storage_level 2"),
        "past the budget itself: {text}"
    );
    // WARN ONLY: a write is accepted far past the budget.
    let db = handle.lock().unwrap().clone().unwrap();
    db.write(|tx| {
        Ok(tx.execute(
            "INSERT INTO blobs (at, data) VALUES (1, zeroblob(1048576))",
            [],
        )?)
    })
    .await
    .expect("over the budget, writes still go through");
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn under_the_warn_line_nothing_is_said_and_the_defaults_are_50_and_40() {
    let _one = SERIAL.lock().await;
    let mut app = TestApp::start_with(spec("quiet"), Router::new(), |app| {
        app.app_db(AppDbSpec {
            migrations: schema(),
            import: None,
        })
        .unwrap();
    })
    .await;
    app.login().await;
    let (_, body) = app.get_json("/api/kit/status").await;
    assert!(
        !body["problems"].to_string().contains("storage is"),
        "{body}"
    );
    let (_, text) = TestApp::send_text(app.request(reqwest::Method::GET, "/metrics")).await;
    assert!(
        text.contains("quiet_storage_budget_bytes 52428800"),
        "50 MB: {text}"
    );
    assert!(
        text.contains("quiet_storage_warn_bytes 41943040"),
        "40 MB: {text}"
    );
    assert!(text.contains("quiet_storage_level 0"), "{text}");
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn code_sets_the_budget_and_the_environment_wins_over_code() {
    let _one = SERIAL.lock().await;
    let mut app = TestApp::start_with(spec("coded"), Router::new(), |app| {
        app.storage_budget(100, None);
        app.app_db(AppDbSpec {
            migrations: schema(),
            import: None,
        })
        .unwrap();
    })
    .await;
    let (_, text) = TestApp::send_text(app.request(reqwest::Method::GET, "/metrics")).await;
    assert!(
        text.contains("coded_storage_budget_bytes 104857600"),
        "{text}"
    );
    assert!(
        text.contains("coded_storage_warn_bytes 83886080"),
        "80 MB: 80 % of the budget: {text}"
    );
    app.shutdown().await;

    let mut app = TestApp::start_with_env(
        spec("envwins"),
        Router::new(),
        &[
            ("ENVWINS_STORAGE_BUDGET_MB", "20"),
            ("ENVWINS_STORAGE_WARN_MB", "5"),
        ],
        |app| {
            app.storage_budget(100, Some(90));
            app.app_db(AppDbSpec {
                migrations: schema(),
                import: None,
            })
            .unwrap();
        },
    )
    .await;
    let (_, text) = TestApp::send_text(app.request(reqwest::Method::GET, "/metrics")).await;
    assert!(
        text.contains("envwins_storage_budget_bytes 20971520"),
        "{text}"
    );
    assert!(
        text.contains("envwins_storage_warn_bytes 5242880"),
        "{text}"
    );
    app.shutdown().await;

    // A warn line above the budget is a start error naming both knobs.
    let err = refused(
        spec("bad"),
        &[("BAD_STORAGE_BUDGET_MB", "5"), ("BAD_STORAGE_WARN_MB", "9")],
        |_| {},
    )
    .await;
    assert!(err.contains("warn line"), "{err}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_failed_import_keeps_the_service_up_with_a_problem_and_the_old_files() {
    let _one = SERIAL.lock().await;
    let handle: Arc<Mutex<Option<AppDb>>> = Arc::default();
    let h2 = handle.clone();
    let mut app = TestApp::start_with(spec("imp"), Router::new(), move |app| {
        let db = app
            .app_db(AppDbSpec {
                migrations: schema(),
                import: Some(Box::new(|tx, ctx| {
                    tx.execute("INSERT INTO blobs (at, data) VALUES (0, x'00')", [])?;
                    std::fs::write(ctx.state_dir.join("legacy.json"), b"{}").ok();
                    Err(chassis::Error::dependency(
                        "legacy.json is torn",
                        "restore it from the backup",
                    ))
                })),
            })
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
        app.app_db(AppDbSpec {
            migrations: schema(),
            import: Some(Box::new(|tx, ctx| {
                let old = ctx.state_dir.join("legacy.json");
                std::fs::write(&old, b"[1,2]").unwrap();
                tx.execute(
                    "INSERT INTO blobs (at, data) VALUES (0, x'01'), (0, x'02')",
                    [],
                )?;
                Ok(ImportReport {
                    expected: 2,
                    imported: 2,
                    files: vec![old],
                })
            })),
        })
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
        app.app_db(AppDbSpec {
            migrations: schema(),
            import: None,
        })
        .unwrap();
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
    app.app_db(AppDbSpec {
        migrations: schema(),
        import: None,
    })
    .unwrap();
    app.control().await.unwrap();
    assert!(
        !dir.path().join("chk.db").exists(),
        "--check creates nothing"
    );

    // A database from a newer build.
    drop(
        AppDb::open(
            &dir.path().join("chk.db"),
            AppDbSpec {
                migrations: schema(),
                import: None,
            },
            vec![],
        )
        .unwrap(),
    );
    let conn = chassis::storage::rusqlite::Connection::open(dir.path().join("chk.db")).unwrap();
    conn.execute_batch("PRAGMA user_version = 9").unwrap();
    drop(conn);
    let mut app = App::from_args_with_env(spec("chk"), argv, env, Router::new()).unwrap();
    app.app_db(AppDbSpec {
        migrations: schema(),
        import: None,
    })
    .unwrap();
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
        AppDbSpec {
            migrations: schema(),
            import: None,
        },
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
