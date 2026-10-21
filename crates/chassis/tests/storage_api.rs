//! The Storage page's JSON API (3.11.0): overview, preview, the typed
//! confirmation delete, compact, the same-origin and login rules, and the
//! lock that keeps the kit's file out of reach of every route.
#![cfg(all(feature = "testing", feature = "storage"))]

use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use chassis::AppSpec;
use chassis::shell::backup::server_socket_path;
use chassis::storage::{AppDb, AppDbSpec, DataKind, Filter, Migration, TimeFormat};
use chassis::testing::TestApp;
use reqwest::Method;
use serde_json::{Value, json};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn schema() -> Vec<Migration> {
    vec![Migration::sql(
        "CREATE TABLE events (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, level TEXT NOT NULL, msg TEXT NOT NULL) STRICT;
         CREATE TABLE snoozes (id INTEGER PRIMARY KEY, until INTEGER NOT NULL) STRICT;",
    )]
}

struct Harness {
    app: TestApp,
    db: AppDb,
}

async fn start(name: &'static str) -> Harness {
    let handle: Arc<Mutex<Option<AppDb>>> = Arc::default();
    let h2 = handle.clone();
    let spec = AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    };
    let mut app = TestApp::start_with(spec, Router::new(), move |app| {
        let db = app.app_db(AppDbSpec::new(schema())).unwrap();
        *h2.lock().unwrap() = Some(db);
        app.storage_kind(
            DataKind::new("events", "Events")
                .description("what happened")
                .table("events")
                .time_column("at", TimeFormat::UnixSeconds)
                .filter(Filter::choice("level", "Level", "level", ["info", "error"])),
        );
        app.storage_kind(
            DataKind::new("snoozes", "Snoozes")
                .table("snoozes")
                .time_column("until", TimeFormat::UnixSeconds)
                .finished_by_definition("until < :now"),
        );
    })
    .await;
    app.login().await;
    let db = handle.lock().unwrap().clone().unwrap();
    // 20 events: ten days old and ten fresh.
    let now = chrono_now();
    db.write(move |tx| {
        for i in 0..20i64 {
            let at = if i < 10 {
                now - 10 * 86_400 - i
            } else {
                now - i
            };
            tx.execute(
                "INSERT INTO events (at, level, msg) VALUES (?1, ?2, ?3)",
                chassis::storage::rusqlite::params![
                    at,
                    if i % 2 == 0 { "info" } else { "error" },
                    format!("event {i}")
                ],
            )?;
        }
        Ok(())
    })
    .await
    .unwrap();
    Harness { app, db }
}

fn chrono_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

async fn post(app: &TestApp, path: &str, body: Value) -> (u16, Value) {
    app.json(Method::POST, path, Some(body)).await
}

fn count(db: &AppDb, table: &str) -> i64 {
    db.read_blocking(|c| {
        Ok(c.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))?)
    })
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_overview_has_the_budget_both_files_with_the_log_and_one_row_per_kind() {
    let _one = SERIAL.lock().await;
    let mut h = start("api1").await;
    let (status, body) = h.app.get_json("/api/kit/storage").await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["budget"]["budget_bytes"], 50 * 1024 * 1024);
    assert_eq!(body["budget"]["warn_bytes"], 40 * 1024 * 1024);
    assert_eq!(body["budget"]["level"], "ok");
    assert!(body["budget"]["total_bytes"].as_u64().unwrap() > 0);
    let files = body["files"].as_array().unwrap();
    let roles: Vec<&str> = files.iter().map(|f| f["role"].as_str().unwrap()).collect();
    assert_eq!(roles, ["app", "kit"]);
    assert_eq!(files[0]["file"], "api1.db");
    assert_eq!(files[1]["file"], "api1-kit.db");
    assert_eq!(files[0]["cleanable"], true);
    assert_eq!(
        files[1]["cleanable"], false,
        "the kit file is read-only to the page"
    );
    for f in files {
        assert!(
            f["wal_bytes"].is_u64() && f["db_bytes"].is_u64() && f["reclaimable_bytes"].is_u64()
        );
        assert_eq!(
            f["total_bytes"].as_u64().unwrap(),
            f["db_bytes"].as_u64().unwrap() + f["wal_bytes"].as_u64().unwrap()
        );
    }
    let kinds = body["kinds"].as_array().unwrap();
    assert_eq!(kinds.len(), 2);
    let events = &kinds[0];
    assert_eq!(events["id"], "events");
    assert_eq!(events["rows"], 20);
    assert!(events["bytes"].as_u64().unwrap() > 0);
    assert!(events["oldest"].as_str().unwrap().ends_with('Z'));
    assert!(events["newest"].as_str().unwrap() > events["oldest"].as_str().unwrap());
    assert_eq!(events["filters"][0]["name"], "level");
    assert_eq!(events["filters"][0]["type"], "choice");
    assert_eq!(events["filters"][0]["values"], json!(["info", "error"]));
    assert_eq!(kinds[1]["finished_automatically"], true);
    assert_eq!(body["paused"], false);
    h.app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn it_needs_the_admin_login_and_a_post_needs_a_same_origin_request() {
    let _one = SERIAL.lock().await;
    let mut h = start("api2").await;
    // No session cookie.
    let anon = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let r = anon
        .get(h.app.url("/api/kit/storage"))
        .send()
        .await
        .unwrap();
    assert!(
        r.status() == 401 || r.status() == 303,
        "not served to a stranger: {}",
        r.status()
    );
    let r = anon
        .post(h.app.url("/api/kit/storage/events/preview"))
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert!(
        r.status() == 401 || r.status() == 303 || r.status() == 403,
        "{}",
        r.status()
    );
    // A cross-site POST by the logged-in admin's browser is refused.
    let (_, p) = post(
        &h.app,
        "/api/kit/storage/events/preview",
        json!({"older_than_secs": 86400 * 5}),
    )
    .await;
    let r = h
        .app
        .request(Method::POST, "/api/kit/storage/events/delete")
        .headers(h.app.as_cross_site_browser())
        .json(&json!({"older_than_secs": 86400 * 5, "token": p["token"], "confirm": "events"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403, "cross-site delete refused");
    assert_eq!(count(&h.db, "events"), 20, "and nothing was deleted");
    h.app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn preview_is_read_only_and_delete_needs_the_typed_name_then_removes_what_was_shown() {
    let _one = SERIAL.lock().await;
    let mut h = start("api3").await;
    let sel = json!({"older_than_secs": 5 * 86_400});
    let (status, p) = post(&h.app, "/api/kit/storage/events/preview", sel.clone()).await;
    assert_eq!(status, 200, "{p}");
    assert_eq!(p["rows"], 10);
    assert_eq!(p["confirm_with"], "events");
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
    assert!(
        e["remedy"].as_str().unwrap().contains("type `events`"),
        "{e}"
    );
    assert_eq!(count(&h.db, "events"), 20);
    // A token for another selector.
    let (status, _) = post(
        &h.app,
        "/api/kit/storage/events/delete",
        json!({"older_than_secs": 86_400, "token": token, "confirm": "events"}),
    )
    .await;
    assert_eq!(status, 400);
    // The real thing.
    let (status, d) = post(
        &h.app,
        "/api/kit/storage/events/delete",
        json!({"older_than_secs": 5 * 86_400, "token": token, "confirm": "events"}),
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
        json!({"filters": {"level": "error"}, "token": p["token"], "confirm": "events"}),
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
