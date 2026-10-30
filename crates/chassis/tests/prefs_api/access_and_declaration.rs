//! Auth and same-origin rules, where the table lives and bad declarations.

use axum::Router;
use chassis::storage::{AppDbSpec, BrowserKeys};
use chassis::testing::TestApp;
use reqwest::Method;
use serde_json::json;

use crate::fixtures::{SERIAL, put, rows, spec, start};

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn auth_and_the_same_origin_rule_apply_like_the_other_kit_posts() {
    let _one = SERIAL.lock().await;
    let mut h = start("prefs5", &[]).await;
    let app = &h.0;
    // Without a session: not served.
    let anon = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let r = anon.get(app.url("/api/kit/prefs")).send().await.unwrap();
    assert!(r.status().is_redirection() || r.status().as_u16() == 401);
    let r = anon
        .put(app.url("/api/kit/prefs/homelab.x"))
        .json(&json!({"value": "1"}))
        .send()
        .await
        .unwrap();
    assert!(r.status().is_redirection() || r.status().as_u16() == 401);
    // A cross-site browser request is refused.
    let r = app
        .request(Method::PUT, "/api/kit/prefs/homelab.x")
        .headers(app.as_cross_site_browser())
        .json(&json!({"value": "1"}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status().as_u16(), 403);
    let r = app
        .request(Method::DELETE, "/api/kit/prefs/homelab.x")
        .headers(app.as_cross_site_browser())
        .send()
        .await
        .unwrap();
    assert_eq!(r.status().as_u16(), 403);
    assert_eq!(rows(&h.1), 0);
    h.0.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_preferences_table_lives_in_the_app_file_never_the_kit_file() {
    let _one = SERIAL.lock().await;
    let mut h = start("prefs7", &[]).await;
    put(&h.0, "homelab-toured", "1").await;
    h.0.shutdown().await;
    let kit = chassis::storage::rusqlite::Connection::open_with_flags(
        h.0.state_dir().join("prefs7-kit.db"),
        chassis::storage::rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .unwrap();
    let n: i64 = kit
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE name = 'chassis_prefs'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(n, 0);
}

async fn refused(name: &'static str, configure: impl FnOnce(&mut chassis::App)) -> String {
    match TestApp::try_start_with_env(spec(name), Router::new(), &[], configure).await {
        Ok(mut app) => {
            app.shutdown().await;
            panic!("the service started but should have been refused");
        }
        Err(e) => e.to_string(),
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_bad_declaration_stops_the_start_with_the_reason() {
    let _one = SERIAL.lock().await;
    let e = refused("prefs8", |app| {
        app.sync_browser_keys(BrowserKeys::new().prefix("a."));
    })
    .await;
    assert!(e.contains("somewhere to keep"), "{e}");
    let e = refused("prefs9", |app| {
        app.app_db(AppDbSpec::new(Vec::new())).unwrap();
        app.sync_browser_keys(BrowserKeys::new().prefix("myapp.session-token"));
    })
    .await;
    assert!(e.contains("secret"), "{e}");
    let e = refused("prefs10", |app| {
        app.app_db(AppDbSpec::new(Vec::new())).unwrap();
        app.sync_browser_keys(BrowserKeys::new());
    })
    .await;
    assert!(e.contains("declares no key"), "{e}");
}

/// A service that declares nothing has no routes and no injection: the kit
/// never syncs a key it was not told to.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_service_that_declares_nothing_syncs_nothing() {
    let _one = SERIAL.lock().await;
    let mut app = TestApp::start_with(spec("prefs11"), Router::new(), |app| {
        app.app_db(AppDbSpec::new(Vec::new())).unwrap();
    })
    .await;
    app.login().await;
    let (s, _) = app.get_json("/api/kit/prefs").await;
    assert_eq!(s, 404);
    let (_, html) = app.page("/status").await;
    assert!(!html.contains("chassis-prefs"));
    app.shutdown().await;
}
