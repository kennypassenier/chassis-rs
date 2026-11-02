//! The API door's 401 remedy in a mounted app: with a vocabulary of
//! "source" on a "Sources" page, a program that sent an unknown token is
//! told where the token is issued; a call with no header keeps the
//! original remedy. Both keep the same `error` text and status.
#![cfg(feature = "dashboard")]

use std::collections::BTreeMap;

use axum::Router;
use chassis::{App, AppSpec};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const TOKEN: &str = "an-admin-token-that-is-long-enough";
const KEY: &str = "efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef";

fn env(dir: &std::path::Path) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    env.insert("DOORDEMO_STATE_DIR".into(), dir.display().to_string());
    env.insert("DOORDEMO_LISTEN".into(), "127.0.0.1:0".into());
    env.insert("DOORDEMO_LOG".into(), "warn".into());
    env.insert("DOORDEMO_TOKEN".into(), TOKEN.into());
    env.insert("DOORDEMO_SECRET_KEY".into(), KEY.into());
    // Only read when the passkeys feature is compiled in (--all-features).
    env.insert(
        "DOORDEMO_PUBLIC_URL".into(),
        "https://bearerdemo.example.lan".into(),
    );
    env
}

/// One raw HTTP/1.1 request; returns (status, headers lowercased, body).
async fn http(
    addr: std::net::SocketAddr,
    method: &str,
    path: &str,
    extra: &[(&str, &str)],
    body: &str,
) -> (u16, String, String) {
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let mut request = format!("{method} {path} HTTP/1.1\r\nHost: {addr}\r\n");
    for (k, v) in extra {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str(&format!(
        "Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    ));
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).await.unwrap();
    let text = String::from_utf8_lossy(&raw).to_string();
    let status: u16 = text.split_whitespace().nth(1).unwrap().parse().unwrap();
    let mut parts = text.splitn(2, "\r\n\r\n");
    let headers = parts.next().unwrap_or_default().to_ascii_lowercase();
    let body = parts.next().unwrap_or_default().to_string();
    (status, headers, body)
}

#[tokio::test]
async fn unknown_token_remedy_names_the_apps_vocabulary_and_page() {
    let dir = tempfile::tempdir().unwrap();
    let api = Router::new().route("/api/ping", axum::routing::get(|| async { "pong" }));
    let mut app = App::from_args_with_env(
        AppSpec {
            name: "doordemo",
            version: "0.0.0",
            ..Default::default()
        },
        vec!["doordemo".into()],
        env(dir.path()),
        Router::new(),
    )
    .unwrap();
    app.api_routes(api);
    app.vocabulary("source", "sources");
    let running = app.start().await.unwrap();
    let addr = running.addr;

    let (status, _, body) = http(
        addr,
        "GET",
        "/api/ping",
        &[("Authorization", "Bearer rotated-or-mistyped")],
        "",
    )
    .await;
    println!("unknown bearer: {status} {body}");
    assert_eq!(status, 401, "{body}");
    let err: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(err["error"], "missing or invalid credentials");
    let remedy = err["remedy"].as_str().unwrap();
    assert!(
        remedy.contains("issued for this source on the Sources page"),
        "{body}"
    );
    assert!(!body.contains("rotated-or-mistyped"), "{body}");

    let (status, _, body) = http(addr, "GET", "/api/ping", &[], "").await;
    println!("no header: {status} {body}");
    assert_eq!(status, 401, "{body}");
    let err: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(err["error"], "missing or invalid credentials");
    assert_eq!(
        err["remedy"],
        "send Authorization: Bearer <client token>, or log in on /login"
    );
}
