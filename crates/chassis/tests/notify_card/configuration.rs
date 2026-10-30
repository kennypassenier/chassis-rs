//! Which source wins for the notification targets, and what a locked value does.

use serde_json::{Value, json};

use crate::fixtures::{SERIAL, overview, start};

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
