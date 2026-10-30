//! Shared setup for the notification card tests: a fake receiver, the
//! app spec and the polling helpers.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use chassis::AppSpec;
use chassis::shell::notify::Notifier;
use chassis::testing::TestApp;
use serde_json::Value;

pub static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub type Seen = Arc<Mutex<Vec<(HeaderMap, String)>>>;

/// A target that records what it gets and answers `status`
/// (with `Kyu-Duplicate: true` when `duplicate`).
pub async fn receiver(status: u16, duplicate: bool) -> (String, Seen) {
    let seen: Seen = Arc::default();
    let s2 = seen.clone();
    let app = Router::new().route(
        "/t/ops",
        post(move |headers: HeaderMap, body: String| {
            let s2 = s2.clone();
            async move {
                s2.lock().unwrap().push((headers, body));
                let mut h = HeaderMap::new();
                if duplicate {
                    h.insert("kyu-duplicate", "true".parse().unwrap());
                }
                (StatusCode::from_u16(status).unwrap(), h, "{}")
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{addr}/t/ops"), seen)
}

/// A port that refuses at once.
pub fn refused() -> String {
    let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = l.local_addr().unwrap().port();
    drop(l);
    format!("http://127.0.0.1:{port}/t/ops")
}

pub fn spec(name: &'static str) -> AppSpec {
    AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    }
}

/// Fast sends: no retries, a short timeout.
pub fn fast(prefix: &str, extra: &[(&str, &str)]) -> Vec<(String, String)> {
    let mut v = vec![
        (format!("{prefix}_NOTIFY_RETRIES"), "0".to_string()),
        (format!("{prefix}_NOTIFY_TIMEOUT_SECS"), "2".to_string()),
        (format!("{prefix}_NOTIFY_BACKOFF_BASE_MS"), "1".to_string()),
    ];
    v.extend(
        extra
            .iter()
            .map(|(k, x)| (format!("{prefix}_{k}"), x.to_string())),
    );
    v
}

pub async fn start(
    name: &'static str,
    prefix: &str,
    extra: &[(&str, &str)],
    code: Option<(&'static str, Option<&'static str>)>,
) -> (TestApp, Notifier) {
    let env = fast(prefix, extra);
    let env: Vec<(&str, &str)> = env.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
    let slot: Arc<Mutex<Option<Notifier>>> = Arc::default();
    let s2 = slot.clone();
    let mut app = TestApp::start_with_env(spec(name), Router::new(), &env, move |app| {
        if let Some((p, f)) = code {
            app.notify_targets(p, f);
        }
        *s2.lock().unwrap() = Some(app.notifier());
    })
    .await;
    app.login().await;
    let n = slot.lock().unwrap().clone().unwrap();
    (app, n)
}

pub async fn overview(app: &TestApp) -> Value {
    let (status, body) = app.get_json("/api/kit/notify").await;
    assert_eq!(status, 200, "{body}");
    body
}

pub async fn until(app: &TestApp, what: &str, ok: impl Fn(&Value) -> bool) -> Value {
    for _ in 0..150 {
        let v = overview(app).await;
        if ok(&v) {
            return v;
        }
        tokio::time::sleep(Duration::from_millis(40)).await;
    }
    panic!("never reached: {what}: {}", overview(app).await);
}
