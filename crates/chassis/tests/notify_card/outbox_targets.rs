//! Messages without a target must not block the ones behind them, and a
//! failure is recorded against the target that failed ([fix-outbox-1],
//! [fix-outbox-2]).

use serde_json::json;

use crate::fixtures::{SERIAL, overview, receiver, refused, start, until};
use crate::link_and_kit::bodies_of;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn an_app_event_without_a_target_does_not_block_kit_events_behind_it() {
    let _one = SERIAL.lock().await;
    let (kit, k_seen) = receiver(200, false).await;
    // The primary is a code default, so the page can clear it again.
    let dead: &'static str = Box::leak(refused().into_boxed_str());
    let (mut app, n) = start(
        "nc-hol",
        "NC_HOL",
        &[("NOTIFY_KIT_URL", &kit)],
        Some((dead, None)),
    )
    .await;
    n.emit("task.due", "1.0.0", "app event, primary down");
    until(&app, "the app event failed once", |v| {
        v["outbox"]["waiting"] == 1 && !v["last_error"].is_null()
    })
    .await;
    let (s, body) = app
        .post_json("/api/kit/notify/settings", json!({"primary": ""}))
        .await;
    assert_eq!(s, 200, "{body}");
    n.emit("update.ok", "1.0.0", "kit event behind it");
    bodies_of(&k_seen, "update.ok").await;
    let v = until(&app, "only the app event is left", |v| {
        v["outbox"]["waiting"] == 1
    })
    .await;
    assert_eq!(
        v["outbox"]["no_target"], 1,
        "the card counts what has nowhere to go: {v}"
    );
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_kit_target_failure_is_recorded_for_the_kit_not_the_primary() {
    let _one = SERIAL.lock().await;
    let (primary, _p_seen) = receiver(200, false).await;
    let (mut app, n) = start(
        "nc-kiterr",
        "NC_KITERR",
        &[("NOTIFY_URL", &primary), ("NOTIFY_KIT_URL", &refused())],
        None,
    )
    .await;
    n.emit("update.ok", "1.0.0", "kit event, kit target down");
    let v = until(&app, "the kit failure is recorded", |v| {
        !v["last_error"].is_null()
    })
    .await;
    assert_eq!(v["last_error"]["target"], "kit", "{v}");
    assert!(v["last_errors"]["kit"]["message"].is_string(), "{v}");
    assert!(v["last_errors"]["primary"].is_null(), "{v}");
    let _ = overview(&app).await;
    app.shutdown().await;
}
