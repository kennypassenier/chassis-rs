//! Web Push end to end (habits-push-1): the three routes behind the kit's
//! real login and same-origin rule, the sealed key in the kit file, the
//! handle on the running app, and the worker the browser gets.
#![cfg(all(feature = "testing", feature = "push"))]

use std::sync::{Arc, Mutex};

use axum::Router;
use chassis::AppSpec;
use chassis::push::{Push, PushHandle};
use chassis::shell::webapp::WebApp;
use chassis::testing::TestApp;
use reqwest::Method;
use serde_json::json;

const P256DH: &str =
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const AUTH: &str = "BTBZMqHH6r4Tts7J_aSIgg";
const FILES: &[(&str, &[u8])] = &[("index.html", b"<html><head></head><body>x</body></html>")];

fn sub(endpoint: &str) -> serde_json::Value {
    json!({"endpoint": endpoint, "keys": {"p256dh": P256DH, "auth": AUTH}})
}

async fn start(name: &'static str, env: &[(&str, &str)]) -> (TestApp, PushHandle) {
    let handle: Arc<Mutex<Option<PushHandle>>> = Arc::default();
    let h2 = handle.clone();
    let spec = AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    };
    let mut app = TestApp::start_with_env(spec, Router::new(), env, move |app| {
        *h2.lock().unwrap() = Some(app.push());
        app.webapp(WebApp::embedded(FILES));
    })
    .await;
    app.login().await;
    let push = handle.lock().unwrap().clone().unwrap();
    (app, push)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_routes_need_the_login_and_the_same_origin_rule() {
    let (mut app, _) = start("push1", &[]).await;
    let anon = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let r = anon.get(app.url("/api/kit/push/key")).send().await.unwrap();
    assert!(r.status().is_redirection() || r.status().as_u16() == 401);
    let r = anon
        .post(app.url("/api/kit/push/subscribe"))
        .json(&sub("https://push.example/a"))
        .send()
        .await
        .unwrap();
    assert!(r.status().is_redirection() || r.status().as_u16() == 401);
    let r = app
        .request(Method::POST, "/api/kit/push/subscribe")
        .headers(app.as_cross_site_browser())
        .json(&sub("https://push.example/a"))
        .send()
        .await
        .unwrap();
    assert_eq!(
        r.status().as_u16(),
        403,
        "a cross-site page cannot subscribe"
    );
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn subscribe_and_unsubscribe_work_and_http_is_refused() {
    let (mut app, _) = start("push2", &[]).await;
    let (status, key) = app.get_json("/api/kit/push/key").await;
    assert_eq!(status, 200);
    assert_eq!(
        key["public_key"].as_str().unwrap().len(),
        87,
        "65 bytes, base64url"
    );
    let (status, out) = app
        .post_json("/api/kit/push/subscribe", sub("https://push.example/a"))
        .await;
    assert_eq!((status, &out["created"]), (200, &json!(true)));
    let (status, _) = app
        .post_json("/api/kit/push/subscribe", sub("http://push.example/a"))
        .await;
    assert_eq!(status, 400, "an http endpoint is refused");
    let (_, out) = app
        .post_json(
            "/api/kit/push/unsubscribe",
            json!({"endpoint": "https://push.example/a"}),
        )
        .await;
    assert_eq!(out, json!({"removed": true}));
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_handle_needs_a_subject_and_then_reports_an_empty_audience() {
    let (mut app, push) = start("push3", &[]).await;
    assert!(push.is_ready());
    let err = push.send(Push::new("Water drinken")).await.unwrap_err();
    assert!(err.remedy.contains("push_subject"), "{}", err.remedy);
    app.shutdown().await;
    let (mut app, push) = start("push4", &[("PUSH4_PUSH_SUBJECT", "mailto:ops@example.org")]).await;
    let report = push.send(Push::new("Water drinken")).await.unwrap();
    assert_eq!((report.accepted, report.removed, report.failed), (0, 0, 0));
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_key_sits_sealed_in_the_kit_file_and_the_worker_has_the_handlers() {
    let (mut app, _) = start("push5", &[]).await;
    let worker = reqwest::get(app.url("/sw.js"))
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    for needle in [
        "addEventListener('push'",
        "addEventListener('notificationclick'",
        "function clickPlan",
    ] {
        assert!(worker.contains(needle), "{needle}");
    }
    app.shutdown().await;
    let kit = chassis::storage::rusqlite::Connection::open_with_flags(
        app.state_dir().join("push5-kit.db"),
        chassis::storage::rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .unwrap();
    let row: String = kit
        .query_row(
            "SELECT value FROM chassis_meta WHERE key = 'push_vapid_key'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(row.starts_with('{'), "an envelope, not a bare key: {row}");
}
