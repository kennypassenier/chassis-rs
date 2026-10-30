//! The warn line, the defaults and who sets the budget.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use axum::Router;
use chassis::storage::{AppDb, AppDbSpec};
use chassis::testing::TestApp;

use crate::fixtures::{SERIAL, big_import, refused, schema, spec};

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
                assert_eq!(report.budget_bytes, 1_000_000);
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
        text.contains("budgeted_storage_budget_bytes 1000000"),
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
        app.app_db(AppDbSpec::new(schema())).unwrap();
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
        text.contains("quiet_storage_budget_bytes 50000000"),
        "50 MB: {text}"
    );
    assert!(
        text.contains("quiet_storage_warn_bytes 40000000"),
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
        app.app_db(AppDbSpec::new(schema())).unwrap();
    })
    .await;
    let (_, text) = TestApp::send_text(app.request(reqwest::Method::GET, "/metrics")).await;
    assert!(
        text.contains("coded_storage_budget_bytes 100000000"),
        "{text}"
    );
    assert!(
        text.contains("coded_storage_warn_bytes 80000000"),
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
            app.app_db(AppDbSpec::new(schema())).unwrap();
        },
    )
    .await;
    let (_, text) = TestApp::send_text(app.request(reqwest::Method::GET, "/metrics")).await;
    assert!(
        text.contains("envwins_storage_budget_bytes 20000000"),
        "{text}"
    );
    assert!(
        text.contains("envwins_storage_warn_bytes 5000000"),
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
