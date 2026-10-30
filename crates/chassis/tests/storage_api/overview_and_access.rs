//! The Storage overview and the login and same-origin rules around it.

use reqwest::Method;
use serde_json::json;

use crate::fixtures::{SERIAL, count, post, start};

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_overview_has_the_budget_both_files_with_the_log_and_one_row_per_kind() {
    let _one = SERIAL.lock().await;
    let mut h = start("api1").await;
    let (status, body) = h.app.get_json("/api/kit/storage").await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["budget"]["budget_bytes"], 50_000_000);
    assert_eq!(body["budget"]["warn_bytes"], 40_000_000);
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
        .json(&json!({"older_than_secs": 86400 * 5, "token": p["token"], "confirm": "Events"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403, "cross-site delete refused");
    assert_eq!(count(&h.db, "events"), 20, "and nothing was deleted");
    h.app.shutdown().await;
}
