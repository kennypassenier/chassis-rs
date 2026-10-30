//! Preview, delete and compact on the app database.

use std::time::Duration;

use chassis::shell::backup::server_socket_path;
use reqwest::Method;
use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::fixtures::{SERIAL, count, post, start};

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn preview_is_read_only_and_delete_needs_the_typed_name_then_removes_what_was_shown() {
    let _one = SERIAL.lock().await;
    let mut h = start("api3").await;
    let sel = json!({"older_than_secs": 5 * 86_400});
    let (status, p) = post(&h.app, "/api/kit/storage/events/preview", sel.clone()).await;
    assert_eq!(status, 200, "{p}");
    assert_eq!(p["rows"], 10);
    assert_eq!(p["confirm_with"], "Events");
    assert_eq!(p["samples"].as_array().unwrap().len(), 5);
    assert!(p["oldest"].is_string() && p["newest"].is_string() && p["bytes"].is_u64());
    assert_eq!(count(&h.db, "events"), 20, "a preview deletes nothing");

    let token = p["token"].clone();
    // Wrong typed confirmation.
    let (status, e) = post(
        &h.app,
        "/api/kit/storage/events/delete",
        json!({"older_than_secs": 5 * 86_400, "token": token, "confirm": "delete"}),
    )
    .await;
    assert_eq!(status, 400, "{e}");
    assert!(e["remedy"].as_str().unwrap().contains("`Events`"), "{e}");
    assert_eq!(count(&h.db, "events"), 20);
    // A token for another selector.
    let (status, _) = post(
        &h.app,
        "/api/kit/storage/events/delete",
        json!({"older_than_secs": 86_400, "token": token, "confirm": "Events"}),
    )
    .await;
    assert_eq!(status, 400);
    // The real thing.
    let (status, d) = post(
        &h.app,
        "/api/kit/storage/events/delete",
        json!({"older_than_secs": 5 * 86_400, "token": token, "confirm": "Events"}),
    )
    .await;
    assert_eq!(status, 200, "{d}");
    assert_eq!(d["deleted"]["deleted"], 10);
    assert_eq!(d["deleted"]["remaining"], 10);
    assert!(d["budget"]["total_bytes"].is_u64());
    assert_eq!(count(&h.db, "events"), 10);
    h.app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_delete_recounts_so_a_changed_selection_is_refused_not_deleted() {
    let _one = SERIAL.lock().await;
    let mut h = start("api4").await;
    let sel = json!({"filters": {"level": "error"}});
    let (_, p) = post(&h.app, "/api/kit/storage/events/preview", sel).await;
    assert_eq!(p["rows"], 10);
    h.db.write(|tx| {
        Ok(tx.execute(
            "INSERT INTO events (at, level, msg) VALUES (1, 'error', 'late')",
            [],
        )?)
    })
    .await
    .unwrap();
    let (status, e) = post(
        &h.app,
        "/api/kit/storage/events/delete",
        json!({"filters": {"level": "error"}, "token": p["token"], "confirm": "Events"}),
    )
    .await;
    assert_eq!(status, 400, "{e}");
    assert!(
        e["error"]
            .as_str()
            .unwrap()
            .contains("held 10 row(s) at the preview and holds 11"),
        "{e}"
    );
    assert_eq!(count(&h.db, "events"), 21, "nothing was deleted");
    h.app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn compact_previews_then_reclaims_and_is_refused_while_a_backup_pause_holds_the_state() {
    let _one = SERIAL.lock().await;
    let mut h = start("api5").await;
    // Free some pages.
    h.db.write(|tx| {
        for i in 0..300 {
            tx.execute(
                "INSERT INTO events (at, level, msg) VALUES (?1, 'info', ?2)",
                chassis::storage::rusqlite::params![i, "x".repeat(500)],
            )?;
        }
        tx.execute("DELETE FROM events", [])?;
        Ok(())
    })
    .await
    .unwrap();
    h.db.db().unwrap().checkpoint().unwrap();
    let (status, pre) = post(&h.app, "/api/kit/storage/compact/preview", json!({})).await;
    assert_eq!(status, 200, "{pre}");
    assert!(pre["reclaimable_bytes"].as_u64().unwrap() > 0, "{pre}");
    assert_eq!(pre["paused"], false);

    // A backup pause: refused with a retry hint.
    let path = server_socket_path("api5");
    let mut s = tokio::net::UnixStream::connect(&path).await.unwrap();
    s.write_all(b"pause 30\n").await.unwrap();
    let mut out = String::new();
    s.read_to_string(&mut out).await.unwrap();
    assert!(out.starts_with("paused "), "{out}");
    let r = h
        .app
        .request(Method::POST, "/api/kit/storage/compact")
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 503, "refused while paused");
    assert!(r.headers().contains_key("retry-after"));
    let (_, ov) = h.app.get_json("/api/kit/storage").await;
    assert_eq!(ov["paused"], true);
    let mut s = tokio::net::UnixStream::connect(&path).await.unwrap();
    s.write_all(b"resume\n").await.unwrap();
    let mut out = String::new();
    s.read_to_string(&mut out).await.unwrap();
    tokio::time::sleep(Duration::from_millis(50)).await;

    let (status, done) = post(&h.app, "/api/kit/storage/compact", json!({})).await;
    assert_eq!(status, 200, "{done}");
    assert_eq!(done["compacted"]["reclaimable_bytes"], 0);
    h.app.shutdown().await;
}
