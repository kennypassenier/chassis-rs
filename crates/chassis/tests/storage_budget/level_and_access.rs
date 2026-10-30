//! The level follows a change at once; login, origin and audit rules.

use chassis::testing::TestApp;
use reqwest::Method;
use serde_json::json;

use crate::fixtures::{SERIAL, capture, set, start};

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn budget_the_level_follows_a_change_at_once() {
    let _one = SERIAL.lock().await;
    let (mut app, _db) = start("blevel", &[], 3, None).await;
    let (_, body) = app.get_json("/api/kit/storage").await;
    assert_eq!(body["budget"]["level"], "ok");
    let (status, answer) = set(&app, json!({"budget_mb": 2, "warn_mb": 1})).await;
    assert_eq!(status, 200, "{answer}");
    assert_eq!(answer["budget"]["level"], "over");
    let (_, text) = TestApp::send_text(app.request(Method::GET, "/metrics")).await;
    assert!(text.contains("blevel_storage_level 2"), "{text}");
    let (status, answer) = set(&app, json!({"budget_mb": 8, "warn_mb": 6})).await;
    assert_eq!(status, 200, "{answer}");
    assert_eq!(answer["budget"]["level"], "warn");
    let (status, answer) = set(&app, json!({"budget_mb": 100, "warn_mb": 90})).await;
    assert_eq!(status, 200, "{answer}");
    assert_eq!(answer["budget"]["level"], "ok");
    let (_, body) = app.get_json("/api/kit/storage").await;
    assert_eq!(body["budget"]["level"], "ok");
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn budget_needs_the_login_and_the_same_origin_and_leaves_one_audit_line() {
    let _one = SERIAL.lock().await;
    let (mut app, _db) = start("baudit", &[], 0, None).await;
    let cap = capture();
    // Cross-site: refused.
    let r = app
        .request(Method::POST, "/api/kit/storage/budget")
        .headers(app.as_cross_site_browser())
        .json(&json!({"budget_mb": 20, "warn_mb": 10}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403);
    cap.0.lock().unwrap().clear();
    let (status, _) = set(&app, json!({"budget_mb": 20, "warn_mb": 10})).await;
    assert_eq!(status, 200);
    let log = String::from_utf8(cap.0.lock().unwrap().clone()).unwrap();
    let audit: Vec<&str> = log
        .lines()
        .filter(|l| l.contains("audit=true") && l.contains("the budget was changed"))
        .collect();
    assert_eq!(audit.len(), 1, "exactly one audit line: {log}");
    for part in [
        "action=\"set\"",
        "budget_mb=20",
        "warn_mb=10",
        "budget_mb_before=50",
        "warn_mb_before=40",
    ] {
        assert!(audit[0].contains(part), "{part} in {}", audit[0]);
    }
    app.shutdown().await;
}
