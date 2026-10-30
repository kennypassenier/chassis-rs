//! What every `chassis clients` end-to-end test shares: the in-process service
//! with its client-token door, the command under test (with the rule that the
//! admin token never travels on argv) and the two ways to observe the result.

use std::collections::BTreeMap;
use std::process::{Command, Output};

use axum::Router;
use axum::routing::get;
use chassis::{App, AppSpec, Running};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub const ADMIN: &str = "an-admin-token-that-is-long-enough-k30";
pub const KEY: &str = "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd";
pub const VAR: &str = "TEST_ADMIN_TOKEN";

pub fn env(dir: &std::path::Path) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    env.insert("CLIDEMO_STATE_DIR".into(), dir.display().to_string());
    env.insert("CLIDEMO_LISTEN".into(), "127.0.0.1:0".into());
    env.insert("CLIDEMO_LOG".into(), "warn".into());
    env.insert("CLIDEMO_TOKEN".into(), ADMIN.into());
    env.insert("CLIDEMO_SECRET_KEY".into(), KEY.into());
    // Only read when the passkeys feature is compiled in (--all-features).
    env.insert(
        "CLIDEMO_PUBLIC_URL".into(),
        "https://clidemo.example.lan".into(),
    );
    env
}

pub fn app(dir: &std::path::Path) -> App {
    let mut app = App::from_args_with_env(
        AppSpec {
            name: "clidemo",
            version: "0.0.0",
            ..Default::default()
        },
        vec!["clidemo".into()],
        env(dir),
        Router::new(),
    )
    .unwrap();
    // The door a client token opens: what the E2E checks each token against.
    app.api_routes(Router::new().route("/v1/ping", get(|| async { "pong" })));
    app
}

pub fn base(running: &Running) -> String {
    format!("http://{}", running.addr)
}

/// The command under test. The admin token goes into the child's
/// environment under `VAR`, or nowhere when `token` is `None`; the
/// process's own `CHASSIS_TOKEN` is removed so the default never leaks in.
pub fn chassis(base: &str, args: &[&str], token: Option<&str>) -> Command {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_chassis"));
    cmd.arg("clients")
        .args(args)
        .args(["--url", base, "--token-env", VAR])
        .env_remove("CHASSIS_TOKEN");
    if let Some(t) = token {
        cmd.env(VAR, t);
    }
    // K30's first rule: the token is never on argv.
    for a in cmd.get_args() {
        let a = a.to_string_lossy();
        assert!(!a.contains(ADMIN), "argv carries the admin token: {a}");
        assert!(
            a != VAR || true,
            "the variable NAME may appear; its value may not"
        );
    }
    cmd
}

/// Run the command off the runtime thread and hand back the three things
/// every assertion needs.
pub async fn run(mut cmd: Command) -> (i32, String, String) {
    let Output {
        status,
        stdout,
        stderr,
    } = tokio::task::spawn_blocking(move || cmd.output().unwrap())
        .await
        .unwrap();
    (
        status.code().unwrap_or(-1),
        String::from_utf8_lossy(&stdout).to_string(),
        String::from_utf8_lossy(&stderr).to_string(),
    )
}

/// One raw HTTP/1.1 request with a bearer; returns (status, body).
pub async fn bearer(addr: std::net::SocketAddr, path: &str, token: &str) -> (u16, String) {
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {addr}\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).await.unwrap();
    let text = String::from_utf8_lossy(&raw).to_string();
    let status: u16 = text.split_whitespace().nth(1).unwrap().parse().unwrap();
    let body = text
        .split_once("\r\n\r\n")
        .map(|(_, b)| b)
        .unwrap_or_default()
        .to_string();
    (status, body)
}
