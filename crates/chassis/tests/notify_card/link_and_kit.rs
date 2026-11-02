//! A title and link on a notification, and the kit's own events going to
//! `notify_kit_url` (docs/NOTIFY_DESIGN.md, `[notify-link-1]`, `[notify-kit-1]`).

use std::time::Duration;

use chassis::core::notify_link::Link;
use serde_json::Value;

use crate::fixtures::{SERIAL, Seen, overview, receiver, refused, start, until};

/// Wait until `seen` holds a body for `kind`, return the bodies for it.
pub async fn bodies_of(seen: &Seen, kind: &str) -> Vec<String> {
    for _ in 0..150 {
        let found: Vec<String> = seen
            .lock()
            .unwrap()
            .iter()
            .map(|(_, b)| b.clone())
            .filter(|b| b.contains(&format!("\"kind\":\"{kind}\"")))
            .collect();
        if !found.is_empty() {
            return found;
        }
        tokio::time::sleep(Duration::from_millis(40)).await;
    }
    panic!("nothing arrived for {kind}");
}

async fn quiet(seen: &Seen, kind: &str) -> usize {
    tokio::time::sleep(Duration::from_millis(400)).await;
    seen.lock()
        .unwrap()
        .iter()
        .filter(|(_, b)| b.contains(kind))
        .count()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_linked_event_carries_title_and_url_through_the_outbox_and_the_fallback() {
    let _one = SERIAL.lock().await;
    let (fallback, fb_seen) = receiver(200, false).await;
    let (mut app, n) = start(
        "nc-link",
        "NC_LINK",
        &[
            ("NOTIFY_URL", &refused()),
            ("NOTIFY_FALLBACK_URL", &fallback),
        ],
        None,
    )
    .await;
    let link = Link::new(Some("Water drinken"), Some("/tasks/42")).unwrap();
    n.emit_linked("task.due", "1.0.0", "drink", link);
    n.emit("task.plain", "1.0.0", "no link");
    let body = &bodies_of(&fb_seen, "task.due").await[0];
    assert!(
        body.ends_with(r#","detail":"drink","title":"Water drinken","url":"/tasks/42"}"#),
        "{body}"
    );
    let plain = &bodies_of(&fb_seen, "task.plain").await[0];
    assert!(
        plain.ends_with(r#","detail":"no link"}"#),
        "no link, no extra fields: {plain}"
    );
    until(&app, "outbox empty", |v| v["outbox"]["waiting"] == 0).await;
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn kit_events_go_to_the_kit_target_and_app_events_never_do() {
    let _one = SERIAL.lock().await;
    let (primary, p_seen) = receiver(200, false).await;
    let (kit, k_seen) = receiver(200, false).await;
    let (mut app, n) = start(
        "nc-kit",
        "NC_KIT",
        &[("NOTIFY_URL", &primary), ("NOTIFY_KIT_URL", &kit)],
        None,
    )
    .await;
    n.emit("update.ok", "1.0.0", "kit event");
    n.emit("health.degraded", "1.0.0", "kit event two");
    n.emit("task.due", "1.0.0", "app event");
    bodies_of(&k_seen, "update.ok").await;
    bodies_of(&k_seen, "health.degraded").await;
    bodies_of(&p_seen, "task.due").await;
    assert_eq!(
        quiet(&k_seen, "task.due").await,
        0,
        "an app event never goes to the kit target"
    );
    assert_eq!(
        quiet(&p_seen, "update.ok").await,
        0,
        "a kit event leaves the primary alone"
    );
    assert_eq!(quiet(&p_seen, "health.degraded").await, 0);
    let v = overview(&app).await;
    assert_eq!(v["kit"]["set"], true);
    assert_eq!(v["kit"]["locked"], true, "configuration only");
    assert_eq!(
        v["kit"]["address"],
        format!("http://{}/…", host_of(&kit)),
        "{v}"
    );
    app.shutdown().await;
}

fn host_of(url: &str) -> String {
    url.trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap()
        .to_string()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn without_a_kit_target_kit_events_go_to_the_primary_as_before() {
    let _one = SERIAL.lock().await;
    let (primary, p_seen) = receiver(200, false).await;
    let (mut app, n) = start("nc-nokit", "NC_NOKIT", &[("NOTIFY_URL", &primary)], None).await;
    n.emit("update.ok", "1.0.0", "kit event");
    bodies_of(&p_seen, "update.ok").await;
    assert_eq!(
        overview(&app).await["kit"],
        Value::Null,
        "no kit line when unset"
    );
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_kit_target_that_is_down_hands_the_message_to_the_fallback() {
    let _one = SERIAL.lock().await;
    let (fallback, fb_seen) = receiver(200, false).await;
    let (mut app, n) = start(
        "nc-kitfb",
        "NC_KITFB",
        &[
            ("NOTIFY_KIT_URL", &refused()),
            ("NOTIFY_FALLBACK_URL", &fallback),
        ],
        None,
    )
    .await;
    n.emit("update.failed", "1.0.0", "kit event, kit target down");
    bodies_of(&fb_seen, "update.failed").await;
    let v = until(&app, "delivered via the fallback", |v| {
        v["last_delivery"]["via"] == "fallback"
    })
    .await;
    assert_eq!(v["active"], true);
    app.shutdown().await;
}
