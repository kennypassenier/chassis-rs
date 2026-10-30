//! The kit file is never touched, and a service without an app database.

use std::time::Duration;

use axum::Router;
use chassis::AppSpec;
use chassis::testing::TestApp;
use serde_json::json;

use crate::fixtures::{SERIAL, post, start};

/// Decision 2, locked: no route reaches the kit's file. A kind named after
/// it does not exist; compact only ever vacuums the app file, which a pile of
/// freed pages in the kit file proves.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_kit_file_can_never_be_previewed_deleted_from_or_compacted() {
    let _one = SERIAL.lock().await;
    let mut h = start("api6").await;
    for kind in [
        "kit",
        "api6-kit.db",
        "kit_clients",
        "clients",
        "sessions",
        "passkeys",
    ] {
        let (status, _) = post(
            &h.app,
            &format!("/api/kit/storage/{kind}/preview"),
            json!({}),
        )
        .await;
        assert!(
            status == 404 || status == 400,
            "{kind}: preview answered {status}"
        );
        assert_ne!(status, 200, "{kind}");
        let (status, _) = post(
            &h.app,
            &format!("/api/kit/storage/{kind}/delete"),
            json!({"token": "x", "confirm": kind}),
        )
        .await;
        assert_ne!(status, 200, "{kind}: delete");
    }
    // The kit tables are not kinds, and an app cannot declare them (see the
    // unit test); the overview lists only the app's kinds.
    let (_, ov) = h.app.get_json("/api/kit/storage").await;
    let ids: Vec<&str> = ov["kinds"]
        .as_array()
        .unwrap()
        .iter()
        .map(|k| k["id"].as_str().unwrap())
        .collect();
    assert_eq!(ids, ["events", "snoozes"]);

    // Free pages in the KIT file, through a second connection: fill the
    // sessions table and empty it again.
    {
        let kit =
            chassis::storage::rusqlite::Connection::open(h.app.state_dir().join("api6-kit.db"))
                .unwrap();
        kit.busy_timeout(Duration::from_secs(5)).unwrap();
        kit.execute_batch(
            "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 2000)
             INSERT INTO kit_sessions (id_hash, created_at, expires_at, remember)
             SELECT hex(randomblob(100)), 1, 2, 0 FROM n;
             DELETE FROM kit_sessions;",
        )
        .unwrap();
    }
    // Free pages in the app file too, then compact.
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
    let (_, before) = h.app.get_json("/api/kit/storage").await;
    let kit_reclaim_before = before["files"][1]["reclaimable_bytes"].as_u64().unwrap();
    assert!(
        kit_reclaim_before > 0,
        "the kit file has freed pages to (not) reclaim"
    );
    let (status, _) = post(&h.app, "/api/kit/storage/compact", json!({})).await;
    assert_eq!(status, 200);
    let (_, after) = h.app.get_json("/api/kit/storage").await;
    assert_eq!(
        after["files"][0]["reclaimable_bytes"], 0,
        "the app file was compacted"
    );
    assert!(
        after["files"][1]["reclaimable_bytes"].as_u64().unwrap() >= kit_reclaim_before,
        "the kit file was not: {kit_reclaim_before} -> {}",
        after["files"][1]["reclaimable_bytes"]
    );
    h.app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn without_an_app_database_the_overview_shows_the_kit_file_and_cleanup_is_a_404() {
    let _one = SERIAL.lock().await;
    let spec = AppSpec {
        name: "api7",
        version: "0.0.0",
        ..Default::default()
    };
    let mut app = TestApp::start(spec, Router::new()).await;
    app.login().await;
    let (status, ov) = app.get_json("/api/kit/storage").await;
    assert_eq!(status, 200, "{ov}");
    assert_eq!(ov["has_app_db"], false);
    assert_eq!(ov["files"].as_array().unwrap().len(), 1);
    assert_eq!(ov["files"][0]["role"], "kit");
    assert_eq!(ov["kinds"], json!([]));
    let (status, _) = post(&app, "/api/kit/storage/events/preview", json!({})).await;
    assert_eq!(status, 404);
    let (status, _) = post(&app, "/api/kit/storage/compact", json!({})).await;
    assert_eq!(status, 404);
    app.shutdown().await;
}
