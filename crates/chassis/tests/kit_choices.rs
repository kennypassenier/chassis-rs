//! Kenny's three kit-page choices (round [kp11], 2026-11-02), rendered.
//! The source locks for the Storage legend and the banner height are in
//! `tests/kenny_rules/kit_choices.rs`.
#![cfg(feature = "testing")]

use axum::Router;
use chassis::AppSpec;
use chassis::testing::TestApp;

/// [fix-kit-choice-1] "Weg bij anoniem": the login page, which anyone can
/// open, carries neither the version nor the start time. `/healthz` is
/// unchanged: the homelab reads its `version` field.
#[tokio::test]
async fn an_anonymous_visitor_sees_no_version_or_start_time_on_the_login_page() {
    let spec = AppSpec {
        name: "choicedemo",
        version: "7.7.7",
        ..Default::default()
    };
    let mut app = TestApp::start(spec, Router::new()).await;
    let (status, body) = app.page("/login").await;
    assert_eq!(status, 200, "{body}");
    assert!(body.contains("data-kit-health"), "the health line stays");
    assert!(
        !body.contains("7.7.7")
            && !body.contains("kit-login__facts")
            && !body.contains("data-kp-ago"),
        "the login page leaks the version or the start time"
    );
    let (status, health) = app.get_json("/healthz").await;
    assert_eq!(status, 200, "{health}");
    assert!(
        health.to_string().contains("7.7.7"),
        "/healthz keeps its version: {health}"
    );
    app.shutdown().await;
}
