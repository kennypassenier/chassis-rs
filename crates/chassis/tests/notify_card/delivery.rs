//! Delivery of messages: fallback, the on-disk queue, duplicates and the test button.

use std::time::Duration;

use serde_json::json;

use crate::fixtures::{SERIAL, overview, receiver, refused, start, until};

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
