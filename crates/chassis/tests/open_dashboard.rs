//! An OPEN dashboard is an opt-in (kyu K2-4, 2026-09-06): a service that
//! sets `AppSpec::open_dashboard` and runs without `<P>_TOKEN` and
//! `<P>_SECRET_KEY` serves every page and route to whoever reaches it, says
//! so on every page, and a service that did not opt in still refuses.
//! Driven through `chassis::testing` (K25) since 1.8.0.
#![cfg(feature = "testing")]

use axum::Router;
use axum::routing::post;
use chassis::AppSpec;
use chassis::testing::TestApp;
use reqwest::Method;

fn spec(open: bool) -> AppSpec {
    AppSpec {
        name: "opendemo",
        version: "0.0.0",
        open_dashboard: open,
        ..Default::default()
    }
}

#[tokio::test]
async fn an_opted_in_service_runs_open_and_says_so_on_every_page() {
    let mut app = TestApp::start_open(spec(true), Router::new(), |app| {
        app.api_routes(Router::new().route("/v1/ping", post(|| async { "pong" })));
    })
    .await;
    let (status, body) = app.page("/").await;
    assert_eq!(status, 200, "no login needed: {body}");
    assert!(
        body.contains("This dashboard is open"),
        "the banner is on the status page"
    );
    assert!(!body.contains("Log out"), "there is nothing to log out of");
    let (status, body) = app.page("/clients").await;
    assert_eq!(status, 200);
    assert!(
        body.contains("No tokens can be issued while the dashboard is open"),
        "{body}"
    );
    assert!(
        !body.contains("form id=\"issue\""),
        "the issue form is absent"
    );
    let (status, body) = TestApp::send_text(app.request(Method::POST, "/v1/ping")).await;
    assert_eq!(status, 200, "an API route answers without a token: {body}");
    assert_eq!(body, "pong");
    let (status, _) = app.page("/login").await;
    assert_eq!(status, 303, "the login page sends an open dashboard home");
    let (status, body) = app.get_json("/healthz").await;
    assert_eq!(status, 200, "{body}");
    app.shutdown().await;
    assert!(
        !app.state_dir().join("clients.json.enc").exists()
            && !app.state_dir().join("sessions.json.enc").exists(),
        "nothing sealed is written by an open run"
    );
}

#[tokio::test]
async fn a_service_that_did_not_opt_in_still_refuses_without_secrets() {
    let error = match TestApp::try_start_open(spec(false), Router::new()).await {
        Ok(mut app) => {
            app.shutdown().await;
            panic!("a dashboard without secrets must not start unless the service opted in");
        }
        Err(e) => e.to_string(),
    };
    assert!(
        error.contains("OPENDEMO_TOKEN") && error.contains("OPENDEMO_SECRET_KEY"),
        "{error}"
    );
    assert!(
        error.contains("open_dashboard"),
        "the remedy names the opt-in: {error}"
    );
}
