//! CF-7 (2026-09-06, found live on CT 112): a dashboard exists for a
//! browser, and a browser submitting a form is a *navigation*. Under the
//! kit's former `referrer-policy: no-referrer` that navigation carried
//! `Origin: null`, which the CSRF rule refused — login included — and the
//! refusal arrived as a bare JSON document on its own tab. These requests
//! send exactly the headers Chrome sends, so the browser is no longer the
//! one environment the suite never covered (rule 35).

use std::collections::BTreeMap;

use chassis::{App, AppSpec};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const TOKEN: &str = "a-login-token-that-is-long-enough";
const KEY: &str = "abababababababababababababababababababababababababababababababab";

fn env(dir: &std::path::Path) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    env.insert("FORMDEMO_STATE_DIR".into(), dir.display().to_string());
    env.insert("FORMDEMO_LISTEN".into(), "127.0.0.1:0".into());
    env.insert("FORMDEMO_LOG".into(), "warn".into());
    env.insert("FORMDEMO_TOKEN".into(), TOKEN.into());
    env.insert("FORMDEMO_SECRET_KEY".into(), KEY.into());
    // The passkeys feature (compiled in under --all-features) wants the
    // public address; nothing here goes through it.
    env.insert(
        "FORMDEMO_PUBLIC_URL".into(),
        "https://formdemo.example.lan".into(),
    );
    env
}

/// One raw HTTP/1.1 request with extra headers; returns (status, headers, body).
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
    let status: u16 = text
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .expect("a status line");
    let mut parts = text.splitn(2, "\r\n\r\n");
    let headers = parts.next().unwrap_or_default().to_ascii_lowercase();
    let body = parts.next().unwrap_or_default().to_string();
    (status, headers, body)
}

/// What Chrome sends on a same-origin form submit under a blanking
/// referrer policy: `Origin: null`, plus the fetch metadata that says the
/// truth about where the request comes from.
const CHROME_SAME_ORIGIN: &[(&str, &str)] = &[
    ("Origin", "null"),
    ("Sec-Fetch-Site", "same-origin"),
    ("Sec-Fetch-Mode", "navigate"),
    ("Sec-Fetch-Dest", "document"),
    ("Accept", "text/html,application/xhtml+xml"),
    ("Content-Type", "application/x-www-form-urlencoded"),
];

#[tokio::test]
async fn a_browser_form_submit_is_accepted_and_a_cross_site_one_is_refused_as_a_page() {
    let dir = tempfile::tempdir().unwrap();
    let app = App::from_args_with_env(
        AppSpec {
            name: "formdemo",
            version: "0.0.0",
            ..Default::default()
        },
        vec!["formdemo".into()],
        env(dir.path()),
        axum::Router::new(),
    )
    .unwrap();
    let running = app.start().await.unwrap();
    let addr = running.addr;

    // The login form, exactly as Chrome submits it, with a wrong token:
    // the login page answers (200 with the message), never the 403.
    let (status, headers, body) = http(
        addr,
        "POST",
        "/login",
        CHROME_SAME_ORIGIN,
        "token=not-the-token",
    )
    .await;
    assert_eq!(
        status, 200,
        "a same-origin form submit passes the CSRF rule: {body}"
    );
    assert!(body.contains("<form"), "the login page comes back: {body}");
    assert!(
        headers.contains("referrer-policy: same-origin"),
        "the policy no longer blanks the same-origin referrer: {headers}"
    );

    // The same submit with the right token logs in (a redirect home).
    let (status, headers, _) = http(
        addr,
        "POST",
        "/login",
        CHROME_SAME_ORIGIN,
        &format!("token={TOKEN}"),
    )
    .await;
    assert_eq!(status, 303, "login succeeded from a browser form");
    assert!(headers.contains("set-cookie"), "a session was issued");

    // A cross-site form post (an attacker's page) is refused — and, being a
    // navigation, refused as a page in the dashboard layout, not as JSON.
    let cross: Vec<(&str, &str)> = CHROME_SAME_ORIGIN
        .iter()
        .map(|(k, v)| {
            if *k == "Sec-Fetch-Site" {
                (*k, "cross-site")
            } else if *k == "Origin" {
                (*k, "https://evil.example")
            } else {
                (*k, *v)
            }
        })
        .collect();
    let (status, headers, body) = http(addr, "POST", "/login", &cross, "token=x").await;
    assert_eq!(status, 403);
    assert!(headers.contains("content-type: text/html"), "{headers}");
    assert!(
        body.contains("kp-nav"),
        "rendered inside the layout: {body}"
    );
    assert!(body.contains("cross-site request"), "{body}");
    assert!(body.contains("Back to the dashboard"), "{body}");

    // A script (no fetch metadata, no Accept for HTML) keeps the JSON shape.
    let (status, headers, body) = http(
        addr,
        "POST",
        "/login",
        &[("Origin", "https://evil.example")],
        "token=x",
    )
    .await;
    assert_eq!(status, 403);
    assert!(
        headers.contains("content-type: application/json"),
        "{headers}"
    );
    assert!(body.contains("\"remedy\""), "{body}");

    running.stop().await;
}
