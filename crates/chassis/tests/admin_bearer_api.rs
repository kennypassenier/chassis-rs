//! K30: the admin token works as a bearer on the dashboard's `/api/clients`
//! routes (what `chassis clients` sends), and a script that sends a wrong
//! bearer gets a 401 with a remedy — not a redirect to a login page it
//! cannot use. A browser without any credential is still redirected.
#![cfg(feature = "dashboard")]

use std::collections::BTreeMap;

use axum::Router;
use chassis::{App, AppSpec};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const TOKEN: &str = "an-admin-token-that-is-long-enough";
const KEY: &str = "efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef";

fn env(dir: &std::path::Path) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    env.insert("BEARERDEMO_STATE_DIR".into(), dir.display().to_string());
    env.insert("BEARERDEMO_LISTEN".into(), "127.0.0.1:0".into());
    env.insert("BEARERDEMO_LOG".into(), "warn".into());
    env.insert("BEARERDEMO_TOKEN".into(), TOKEN.into());
    env.insert("BEARERDEMO_SECRET_KEY".into(), KEY.into());
    // Only read when the passkeys feature is compiled in (--all-features).
    env.insert(
        "BEARERDEMO_PUBLIC_URL".into(),
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

// Drilled red once: the 401 arm in `require_admin` was removed and the
// wrong-bearer assert saw the 303 again.
#[tokio::test]
async fn k30_admin_bearer_manages_clients_and_a_wrong_bearer_gets_401_not_a_redirect() {
    let dir = tempfile::tempdir().unwrap();
    let app = App::from_args_with_env(
        AppSpec {
            name: "bearerdemo",
            version: "0.0.0",
            ..Default::default()
        },
        vec!["bearerdemo".into()],
        env(dir.path()),
        Router::new(),
    )
    .unwrap();
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let admin = format!("Bearer {TOKEN}");

    // The admin token as a bearer: the full clients API, no cookie needed.
    let (status, _, body) = http(
        addr,
        "GET",
        "/api/clients",
        &[("Authorization", &admin)],
        "",
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body.trim(), "[]");
    let (status, _, body) = http(
        addr,
        "POST",
        "/api/clients",
        &[
            ("Authorization", &admin),
            ("Content-Type", "application/json"),
        ],
        r#"{"name":"alertmanager"}"#,
    )
    .await;
    assert_eq!(status, 201, "{body}");
    let view: serde_json::Value = serde_json::from_str(&body).unwrap();
    let id = view["id"].as_str().unwrap().to_string();
    let (status, _, body) = http(
        addr,
        "GET",
        &format!("/api/clients/{id}/token"),
        &[("Authorization", &admin)],
        "",
    )
    .await;
    assert_eq!(status, 200, "{body}");
    let revealed: serde_json::Value = serde_json::from_str(&body).unwrap();
    let client_token = revealed["token"].as_str().unwrap().to_string();

    // A wrong bearer: 401 with the kit's JSON shape and a remedy that names
    // the variable, never a redirect. The refused value is not echoed.
    let (status, headers, body) = http(
        addr,
        "GET",
        "/api/clients",
        &[("Authorization", "Bearer definitely-not-the-token")],
        "",
    )
    .await;
    assert_eq!(status, 401, "{headers}\n{body}");
    assert!(!headers.contains("location:"), "{headers}");
    let err: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert!(
        err["error"].as_str().unwrap().contains("BEARERDEMO_TOKEN"),
        "{body}"
    );
    assert!(
        err["remedy"].as_str().unwrap().contains("chassis clients"),
        "{body}"
    );
    assert!(!body.contains("definitely-not-the-token"), "{body}");

    // A client token is a caller, not an admin: also 401, its own message.
    let (status, _, body) = http(
        addr,
        "GET",
        "/api/clients",
        &[("Authorization", &format!("Bearer {client_token}"))],
        "",
    )
    .await;
    assert_eq!(status, 401, "{body}");
    assert!(body.contains("client token cannot"), "{body}");

    // No credential at all is a browser: the redirect to /login stays.
    let (status, headers, _) = http(addr, "GET", "/api/clients", &[], "").await;
    assert_eq!(status, 303, "{headers}");
    assert!(headers.contains("location: /login"), "{headers}");
    let (status, headers, _) = http(addr, "GET", "/clients", &[], "").await;
    assert_eq!(status, 303, "{headers}");

    running.stop().await;
}
