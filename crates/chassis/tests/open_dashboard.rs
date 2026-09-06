//! An OPEN dashboard is an opt-in (kyu K2-4, 2026-09-06): a service that
//! sets `AppSpec::open_dashboard` and runs without `<P>_TOKEN` and
//! `<P>_SECRET_KEY` serves every page and route to whoever reaches it, says
//! so on every page, and a service that did not opt in still refuses.
#![cfg(feature = "dashboard")]

use std::collections::BTreeMap;

use axum::Router;
use axum::routing::post;
use chassis::{App, AppSpec};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn env(dir: &std::path::Path) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    env.insert("OPENDEMO_STATE_DIR".into(), dir.display().to_string());
    env.insert("OPENDEMO_LISTEN".into(), "127.0.0.1:0".into());
    env.insert("OPENDEMO_LOG".into(), "warn".into());
    env
}

fn spec(open: bool) -> AppSpec {
    AppSpec {
        name: "opendemo",
        version: "0.0.0",
        open_dashboard: open,
        ..Default::default()
    }
}

/// One raw HTTP/1.1 request; returns (status, body). No client crate: the
/// kit's dev-dependencies stay small, and four requests need no more.
async fn http(addr: std::net::SocketAddr, method: &str, path: &str) -> (u16, String) {
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {addr}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).await.unwrap();
    let text = String::from_utf8_lossy(&raw).to_string();
    let status: u16 = text
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .expect("a status line");
    let body = text
        .split("\r\n\r\n")
        .nth(1)
        .unwrap_or_default()
        .to_string();
    (status, body)
}

#[tokio::test]
async fn an_opted_in_service_runs_open_and_says_so_on_every_page() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = App::from_args_with_env(
        spec(true),
        vec!["opendemo".into()],
        env(dir.path()),
        Router::new(),
    )
    .expect("no secrets is a valid configuration for an opted-in service");
    app.api_routes(Router::new().route("/v1/ping", post(|| async { "pong" })));
    let running = app.start().await.expect("starts open");
    let addr = running.addr;
    let (status, body) = http(addr, "GET", "/").await;
    assert_eq!(status, 200, "no login needed: {body}");
    assert!(
        body.contains("This dashboard is open"),
        "the banner is on the status page"
    );
    assert!(!body.contains("Log out"), "there is nothing to log out of");
    let (status, body) = http(addr, "GET", "/clients").await;
    assert_eq!(status, 200);
    assert!(
        body.contains("No tokens can be issued while the dashboard is open"),
        "{body}"
    );
    assert!(
        !body.contains("form id=\"issue\""),
        "the issue form is absent"
    );
    let (status, body) = http(addr, "POST", "/v1/ping").await;
    assert_eq!(status, 200, "an API route answers without a token: {body}");
    assert_eq!(body, "pong");
    let (status, _) = http(addr, "GET", "/login").await;
    assert_eq!(status, 303, "the login page sends an open dashboard home");
    let (status, body) = http(addr, "GET", "/healthz").await;
    assert_eq!(status, 200, "{body}");
    running.stop().await;
    assert!(
        !dir.path().join("clients.json.enc").exists()
            && !dir.path().join("sessions.json.enc").exists(),
        "nothing sealed is written by an open run"
    );
}

#[tokio::test]
async fn a_service_that_did_not_opt_in_still_refuses_without_secrets() {
    let dir = tempfile::tempdir().unwrap();
    let app = App::from_args_with_env(
        spec(false),
        vec!["opendemo".into()],
        env(dir.path()),
        Router::new(),
    )
    .expect("construction reads the configuration");
    let error = match app.start().await {
        Ok(running) => {
            running.stop().await;
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
