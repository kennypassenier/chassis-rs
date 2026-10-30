//! Shared setup for the preferences API tests: app spec, browser keys and
//! the put/rows helpers.

use std::sync::{Arc, Mutex};

use axum::Router;
use chassis::AppSpec;
use chassis::storage::{AppDb, AppDbSpec, BrowserKeys};
use chassis::testing::TestApp;
use reqwest::Method;
use serde_json::{Value, json};

pub static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub fn spec(name: &'static str) -> AppSpec {
    AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    }
}

pub fn homelab_keys() -> BrowserKeys {
    BrowserKeys::new()
        .prefix("homelab.")
        .prefix("homelab-")
        .prefix("kp-remember:")
        .session_prefix("kp-unsaved:")
        .except_exact("homelab.theme-light")
}

pub async fn start(name: &'static str, env: &[(&str, &str)]) -> (TestApp, AppDb) {
    let handle: Arc<Mutex<Option<AppDb>>> = Arc::default();
    let h2 = handle.clone();
    let mut app = TestApp::start_with_env(spec(name), Router::new(), env, move |app| {
        let db = app.app_db(AppDbSpec::new(Vec::new())).unwrap();
        *h2.lock().unwrap() = Some(db);
        app.sync_browser_keys(homelab_keys());
    })
    .await;
    app.login().await;
    let db = handle.lock().unwrap().clone().unwrap();
    (app, db)
}

pub async fn put(app: &TestApp, key: &str, value: &str) -> (u16, Value) {
    app.json(
        Method::PUT,
        &format!("/api/kit/prefs/{key}"),
        Some(json!({ "value": value })),
    )
    .await
}

pub fn rows(db: &AppDb) -> i64 {
    db.read_blocking(|c| Ok(c.query_row("SELECT count(*) FROM chassis_prefs", [], |r| r.get(0))?))
        .unwrap()
}
