//! The shared notification sender and its Status card (3.15.0): the
//! precedence of the two addresses, the locked refusal, fallback once, the
//! outbox cap, kyu's duplicate answer and the Test button.
#![cfg(all(feature = "testing", feature = "notify"))]

use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use chassis::AppSpec;
use chassis::shell::notify::Notifier;
use chassis::testing::TestApp;
use serde_json::{Value, json};

static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

type Seen = Arc<Mutex<Vec<(HeaderMap, String)>>>;

/// A target that records what it gets and answers `status`
/// (with `Kyu-Duplicate: true` when `duplicate`).
async fn receiver(status: u16, duplicate: bool) -> (String, Seen) {
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
fn refused() -> String {
    let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = l.local_addr().unwrap().port();
    drop(l);
    format!("http://127.0.0.1:{port}/t/ops")
}

fn spec(name: &'static str) -> AppSpec {
    AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    }
}

/// Fast sends: no retries, a short timeout.
fn fast(prefix: &str, extra: &[(&str, &str)]) -> Vec<(String, String)> {
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

async fn start(
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

async fn overview(app: &TestApp) -> Value {
    let (status, body) = app.get_json("/api/kit/notify").await;
    assert_eq!(status, 200, "{body}");
    body
}

async fn until(app: &TestApp, what: &str, ok: impl Fn(&Value) -> bool) -> Value {
    for _ in 0..150 {
        let v = overview(app).await;
        if ok(&v) {
            return v;
        }
        tokio::time::sleep(Duration::from_millis(40)).await;
    }
    panic!("never reached: {what}: {}", overview(app).await);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn precedence_is_configuration_then_page_then_code_then_nothing() {
    let _one = SERIAL.lock().await;
    // Kit default: nothing set.
    let (mut app, _n) = start("nc-prec1", "NC_PREC1", &[], None).await;
    let v = overview(&app).await;
    assert_eq!(v["primary"]["layer"], "default");
    assert_eq!(v["primary"]["address"], Value::Null);
    assert_eq!(v["active"], false);
    // The page saves a value: it is kept in the database and wins.
    let (s, v) = app
        .post_json(
            "/api/kit/notify/settings",
            json!({"primary": "http://hub.example:8080/t/a"}),
        )
        .await;
    assert_eq!(s, 200, "{v}");
    assert_eq!(v["primary"]["layer"], "page");
    assert_eq!(v["primary"]["address"], "http://hub.example:8080/t/a");
    assert_eq!(v["primary"]["locked"], false);
    assert_eq!(v["active"], true);
    // Reset removes it again.
    let (s, v) = app
        .post_json("/api/kit/notify/settings", json!({"reset": true}))
        .await;
    assert_eq!((s, v["primary"]["layer"].clone()), (200, json!("default")));
    app.shutdown().await;

    // The code default sits below the page value, above nothing.
    let (mut app, _n) = start(
        "nc-prec2",
        "NC_PREC2",
        &[],
        Some(("http://code.example/t/c", None)),
    )
    .await;
    let v = overview(&app).await;
    assert_eq!(
        (
            v["primary"]["layer"].clone(),
            v["primary"]["address"].clone()
        ),
        (json!("code"), json!("http://code.example/t/c"))
    );
    let (_, v) = app
        .post_json(
            "/api/kit/notify/settings",
            json!({"primary": "http://page.example/t/p"}),
        )
        .await;
    assert_eq!(v["primary"]["layer"], "page");
    // A saved empty address is a choice: no target, even with a code default.
    let (_, v) = app
        .post_json("/api/kit/notify/settings", json!({"primary": ""}))
        .await;
    assert_eq!(
        (
            v["primary"]["layer"].clone(),
            v["primary"]["address"].clone()
        ),
        (json!("page"), Value::Null)
    );
    app.shutdown().await;

    // Configuration beats the page value and the code default, and is locked.
    let (mut app, _n) = start(
        "nc-prec3",
        "NC_PREC3",
        &[("NOTIFY_URL", "http://env.example/t/secret-id")],
        Some(("http://code.example/t/c", None)),
    )
    .await;
    let v = overview(&app).await;
    assert_eq!(v["primary"]["layer"], "configuration");
    assert_eq!(v["primary"]["locked"], true);
    assert!(
        v["primary"]["fixed"]["reason"]
            .as_str()
            .unwrap()
            .contains("NC_PREC3_NOTIFY_URL")
    );
    assert_eq!(
        v["primary"]["address"], "http://env.example/…",
        "an env value is shown by host only"
    );
    assert_eq!(v["fallback"]["layer"], "default");
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_locked_value_is_refused_by_the_api_and_the_rest_still_saves() {
    let _one = SERIAL.lock().await;
    let (mut app, _n) = start(
        "nc-lock",
        "NC_LOCK",
        &[("NOTIFY_URL", "http://env.example/t/x")],
        None,
    )
    .await;
    let (s, body) = app
        .post_json(
            "/api/kit/notify/settings",
            json!({"primary": "http://other.example/t/y"}),
        )
        .await;
    assert_eq!(s, 400, "{body}");
    let why = body["error"].as_str().unwrap();
    assert!(
        why.contains("fixed") && why.contains("NC_LOCK_NOTIFY_URL"),
        "{why}"
    );
    assert!(body["remedy"].as_str().unwrap().contains("restart"));
    // The fallback is not locked and saves; the primary is untouched.
    let (s, v) = app
        .post_json(
            "/api/kit/notify/settings",
            json!({"fallback": "http://ha.example/api/webhook/abc"}),
        )
        .await;
    assert_eq!(s, 200, "{v}");
    assert_eq!(v["fallback"]["layer"], "page");
    assert_eq!(v["primary"]["layer"], "configuration");
    // Reset only removes what the page saved.
    let (s, v) = app
        .post_json("/api/kit/notify/settings", json!({"reset": true}))
        .await;
    assert_eq!(s, 200);
    assert_eq!(v["fallback"]["layer"], "default");
    // A bad address is refused in plain words; nothing is stored.
    let (s, body) = app
        .post_json("/api/kit/notify/settings", json!({"fallback": "ftp://x"}))
        .await;
    assert_eq!(s, 400);
    assert!(body["error"].as_str().unwrap().contains("fallback address"));
    // Nothing to change.
    let (s, _) = app.post_json("/api/kit/notify/settings", json!({})).await;
    assert_eq!(s, 400);
    app.shutdown().await;

    // Both fixed: reset has nothing to reset.
    let (mut app, _n) = start(
        "nc-lock2",
        "NC_LOCK2",
        &[
            ("NOTIFY_URL", "http://env.example/t/x"),
            ("NOTIFY_FALLBACK_URL", "http://env.example/t/y"),
        ],
        None,
    )
    .await;
    let v = overview(&app).await;
    assert_eq!(v["can_edit"], false);
    let (s, _) = app
        .post_json("/api/kit/notify/settings", json!({"reset": true}))
        .await;
    assert_eq!(s, 400);
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn when_the_primary_does_not_take_a_message_the_fallback_gets_it_once() {
    let _one = SERIAL.lock().await;
    let (fallback, fb_seen) = receiver(200, false).await;
    let (mut app, n) = start(
        "nc-fb",
        "NC_FB",
        &[
            ("NOTIFY_URL", &refused()),
            ("NOTIFY_FALLBACK_URL", &fallback),
        ],
        None,
    )
    .await;
    n.emit("update.failed", "1.0.0", "it broke");
    let v = until(&app, "delivered via the fallback", |v| {
        v["last_delivery"]["via"] == "fallback" && v["outbox"]["waiting"] == 0
    })
    .await;
    assert_eq!(v["outbox"]["waiting"], 0, "an accepted message is deleted");
    tokio::time::sleep(Duration::from_millis(300)).await;
    {
        let seen = fb_seen.lock().unwrap();
        let mine: Vec<_> = seen
            .iter()
            .filter(|(_, b)| b.contains("update.failed"))
            .collect();
        assert_eq!(mine.len(), 1, "the fallback is asked once per message");
        assert!(
            mine[0].0.get("kyu-dedup-key").is_none(),
            "no key unless the sender asked for one"
        );
    }
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_message_nobody_takes_stays_on_disk_with_the_error_and_the_cap_drops_the_oldest() {
    let _one = SERIAL.lock().await;
    let (mut app, n) = start(
        "nc-cap",
        "NC_CAP",
        &[
            ("NOTIFY_URL", &refused()),
            ("NOTIFY_FALLBACK_URL", &refused()),
            ("NOTIFY_OUTBOX_MAX", "3"),
        ],
        None,
    )
    .await;
    for i in 0..6 {
        n.emit("health.degraded", "1.0.0", format!("event {i}"));
    }
    let v = until(&app, "the cap held and dropped the oldest", |v| {
        v["outbox"]["dropped_total"].as_u64() >= Some(3) && v["outbox"]["waiting"] == 3
    })
    .await;
    assert_eq!(v["outbox"]["cap"], 3);
    let err = v["last_error"]["message"].as_str().unwrap();
    assert!(
        !err.contains("127.0.0.1"),
        "an address never reaches the page: {err}"
    );
    assert!(v["last_error"]["at"].as_str().unwrap().ends_with('Z'));
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_duplicate_answer_counts_as_delivered_and_never_falls_back() {
    let _one = SERIAL.lock().await;
    let (primary, p_seen) = receiver(200, true).await;
    let (fallback, fb_seen) = receiver(200, false).await;
    let (mut app, n) = start(
        "nc-dup",
        "NC_DUP",
        &[("NOTIFY_URL", &primary), ("NOTIFY_FALLBACK_URL", &fallback)],
        None,
    )
    .await;
    let dedup = chassis::core::notify_target::Dedup::new("backup|disk vol", Some("6h")).unwrap();
    n.emit_keyed("backup.failed", "1.0.0", "disk full", dedup);
    let v = until(&app, "delivered via the primary", |v| {
        v["last_delivery"]["via"] == "primary" && v["outbox"]["waiting"] == 0
    })
    .await;
    assert_eq!(v["outbox"]["waiting"], 0);
    {
        let seen = p_seen.lock().unwrap();
        let (headers, _) = seen
            .iter()
            .find(|(_, b)| b.contains("backup.failed"))
            .expect("primary got it");
        assert_eq!(headers["kyu-dedup-key"], "backup|disk vol");
        assert_eq!(headers["kyu-dedup-window"], "6h");
        assert!(
            fb_seen
                .lock()
                .unwrap()
                .iter()
                .all(|(_, b)| !b.contains("backup.failed")),
            "a duplicate is not a failure"
        );
    }
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_test_button_sends_a_marked_message_to_each_target_and_reports() {
    let _one = SERIAL.lock().await;
    let (primary, p_seen) = receiver(200, false).await;
    let (mut app, _n) = start(
        "nc-test",
        "NC_TEST",
        &[
            ("NOTIFY_URL", &primary),
            ("NOTIFY_FALLBACK_URL", &refused()),
        ],
        None,
    )
    .await;
    let (s, body) = app.post_json("/api/kit/notify/test", json!({})).await;
    assert_eq!(s, 200, "{body}");
    let results = body["results"].as_array().unwrap();
    assert_eq!(
        (results[0]["target"].clone(), results[0]["outcome"].clone()),
        (json!("primary"), json!("delivered"))
    );
    assert_eq!(
        (results[1]["target"].clone(), results[1]["outcome"].clone()),
        (json!("fallback"), json!("failed"))
    );
    assert!(!results[1]["detail"].as_str().unwrap().contains("127.0.0.1"));
    {
        let sent = p_seen.lock().unwrap();
        assert!(
            sent.iter()
                .any(|(_, b)| b.contains("\"kind\":\"notify.test\"") && b.contains("TEST")),
            "the message is marked"
        );
    }
    assert_eq!(
        overview(&app).await["outbox"]["waiting"],
        0,
        "a test is never queued"
    );
    app.shutdown().await;

    // No address: refused with a remedy, nothing sent.
    let (mut app, _n) = start("nc-test2", "NC_TEST2", &[], None).await;
    let (s, body) = app.post_json("/api/kit/notify/test", json!({})).await;
    assert_eq!(s, 400);
    assert!(body["remedy"].as_str().unwrap().contains("save"));
    // The Status page carries the card and its module.
    let (status, html) = app.page("/").await;
    assert_eq!(status, 200);
    assert!(html.contains("data-notify-card") && html.contains("/static/notify-card.js"));
    app.shutdown().await;
}
