//! The Preferences kind on the Storage page (3.12.0): the kit registers it
//! for the `chassis_prefs` table, a delete goes through the existing
//! preview and typed confirmation, and nothing is ever cleaned up on its own.
#![cfg(all(feature = "testing", feature = "storage"))]

use axum::Router;
use chassis::AppSpec;
use chassis::storage::{AppDbSpec, BrowserKeys, DataKind};
use chassis::testing::TestApp;
use reqwest::Method;
use serde_json::{Value, json};

static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn spec(name: &'static str) -> AppSpec {
    AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    }
}

async fn start(name: &'static str) -> TestApp {
    let mut app = TestApp::start_with(spec(name), Router::new(), |app| {
        app.app_db(AppDbSpec::new(Vec::new())).unwrap();
        app.sync_browser_keys(BrowserKeys::new().prefix("homelab.").prefix("kp-remember:"));
    })
    .await;
    app.login().await;
    app
}

async fn put(app: &TestApp, key: &str, value: &str) {
    let (s, b) = app
        .json(
            Method::PUT,
            &format!("/api/kit/prefs/{key}"),
            Some(json!({ "value": value })),
        )
        .await;
    assert_eq!(s, 200, "{b}");
}

fn kind<'a>(overview: &'a Value, id: &str) -> &'a Value {
    overview["kinds"]
        .as_array()
        .unwrap()
        .iter()
        .find(|k| k["id"] == id)
        .unwrap_or_else(|| panic!("no kind {id}"))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_overview_lists_preferences_with_rows_and_size() {
    let _one = SERIAL.lock().await;
    let mut app = start("prefsp1").await;
    let (_, empty) = app.get_json("/api/kit/storage").await;
    assert_eq!(kind(&empty, "preferences")["rows"], 0);
    put(&app, "homelab.log-levels", r#"["warn"]"#).await;
    put(&app, "homelab.map.deplist", "list").await;
    put(&app, "kp-remember:datatable:status:sort", "{}").await;
    let (_, o) = app.get_json("/api/kit/storage").await;
    let k = kind(&o, "preferences");
    assert_eq!(k["label"], "Preferences");
    assert_eq!(k["rows"], 3);
    assert!(k["bytes"].as_u64().unwrap() > 0);
    assert!(k["oldest"].as_str().unwrap().ends_with('Z'));
    assert_eq!(k["finished_automatically"], false, "never cleans itself");
    let names: Vec<&str> = k["filters"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["key", "scope"]);
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_targeted_delete_goes_through_preview_and_typed_confirmation() {
    let _one = SERIAL.lock().await;
    let mut app = start("prefsp2").await;
    put(&app, "homelab.log-levels", r#"["warn"]"#).await;
    put(&app, "homelab.map.deplist", "list").await;
    put(&app, "kp-remember:datatable:status:sort", "{}").await;

    let sel = json!({"filters": {"key": "kp-remember"}});
    let (s, p) = app
        .post_json("/api/kit/storage/preferences/preview", sel.clone())
        .await;
    assert_eq!(s, 200, "{p}");
    assert_eq!(p["rows"], 1);
    let sample = &p["samples"][0];
    assert_eq!(sample["key"], "kp-remember:datatable:status:sort");
    assert_eq!(sample["scope"], "admin");
    assert!(sample["bytes"].is_u64());
    assert!(
        sample.get("value").is_none(),
        "the page shows the key and its size, not the value"
    );
    assert_eq!(p["confirm_with"], "Preferences");

    let mut body = sel.clone();
    body["token"] = p["token"].clone();
    body["confirm"] = json!("wrong");
    let (s, _) = app
        .post_json("/api/kit/storage/preferences/delete", body.clone())
        .await;
    assert_eq!(s, 400, "the kind's name must be typed");
    let (_, left) = app.get_json("/api/kit/prefs").await;
    assert_eq!(left["keys"].as_object().unwrap().len(), 3);

    body["confirm"] = json!("Preferences");
    let (s, done) = app
        .post_json("/api/kit/storage/preferences/delete", body)
        .await;
    assert_eq!(s, 200, "{done}");
    assert_eq!(done["deleted"]["deleted"], 1);
    let (_, left) = app.get_json("/api/kit/prefs").await;
    let keys = left["keys"].as_object().unwrap();
    assert_eq!(keys.len(), 2);
    assert!(!keys.contains_key("kp-remember:datatable:status:sort"));
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn nothing_is_removed_on_its_own() {
    let _one = SERIAL.lock().await;
    let mut app = start("prefsp3").await;
    put(&app, "homelab.log-levels", "x").await;
    // The daily prune and the Storage actions' check only touch kinds with a
    // finished-by-definition rule; this kind has none.
    let (_, o) = app.get_json("/api/kit/storage").await;
    assert_eq!(kind(&o, "preferences")["finished_automatically"], false);
    let (_, p) = app.get_json("/api/kit/prefs").await;
    assert_eq!(p["keys"].as_object().unwrap().len(), 1);
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn an_app_cannot_declare_a_kind_with_the_kits_name() {
    let _one = SERIAL.lock().await;
    let e = match TestApp::try_start_with_env(spec("prefsp4"), Router::new(), &[], |app| {
        app.app_db(AppDbSpec::new(Vec::new())).unwrap();
        app.sync_browser_keys(BrowserKeys::new().prefix("a."));
        app.storage_kind(DataKind::new("preferences", "Mine").table("chassis_prefs"));
    })
    .await
    {
        Ok(mut a) => {
            a.shutdown().await;
            panic!("started");
        }
        Err(e) => e.to_string(),
    };
    assert!(e.contains("preferences"), "{e}");
}
