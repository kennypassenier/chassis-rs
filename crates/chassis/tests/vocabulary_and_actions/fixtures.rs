//! Shared setup: a started app, raw HTTP, login and client issue helpers.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use axum::Router;

use chassis::shell::dashboard::{Section, StatusSection};
use chassis::{App, AppSpec};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub const TOKEN: &str = "a-login-token-that-is-long-enough";
pub const KEY: &str = "abababababababababababababababababababababababababababababababab";

pub fn env(dir: &std::path::Path) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    env.insert("VOCABDEMO_STATE_DIR".into(), dir.display().to_string());
    env.insert("VOCABDEMO_LISTEN".into(), "127.0.0.1:0".into());
    env.insert("VOCABDEMO_LOG".into(), "warn".into());
    env.insert("VOCABDEMO_TOKEN".into(), TOKEN.into());
    env.insert("VOCABDEMO_SECRET_KEY".into(), KEY.into());
    env.insert(
        "VOCABDEMO_PUBLIC_URL".into(),
        "https://vocabdemo.example.lan".into(),
    );
    env
}

pub fn app(dir: &std::path::Path, public: Router) -> App {
    App::from_args_with_env(
        AppSpec {
            name: "vocabdemo",
            version: "0.0.0",
            ..Default::default()
        },
        vec!["vocabdemo".into()],
        env(dir),
        public,
    )
    .unwrap()
}

/// One raw HTTP/1.1 request; returns (status, headers lowercased, body).
pub async fn http(
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

pub async fn login(addr: std::net::SocketAddr) -> String {
    let (status, headers, _) = http(
        addr,
        "POST",
        "/login",
        &[("Content-Type", "application/x-www-form-urlencoded")],
        &format!("token={TOKEN}"),
    )
    .await;
    assert_eq!(status, 303);
    let line = headers
        .lines()
        .find(|l| l.starts_with("set-cookie:"))
        .expect("a session cookie");
    line["set-cookie:".len()..]
        .trim()
        .split(';')
        .next()
        .unwrap()
        .to_string()
}

pub async fn issue(addr: std::net::SocketAddr, cookie: &str, name: &str) -> (u16, String) {
    let (status, _, body) = http(
        addr,
        "POST",
        "/api/clients",
        &[("Content-Type", "application/json"), ("Cookie", cookie)],
        &format!(r#"{{"name":"{name}"}}"#),
    )
    .await;
    (status, body)
}

pub fn id_of(body: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(body).unwrap();
    v["id"].as_str().unwrap().to_string()
}

pub type Seen = Arc<Mutex<Vec<String>>>;

pub struct Quiet;

impl StatusSection for Quiet {
    fn render(&self) -> Section {
        Section {
            title: "Quiet".into(),
            explain: "A section that offers nothing to press.".into(),
            rows: vec![("Rows".into(), "1".into())],
            html: None,
        }
    }
}
