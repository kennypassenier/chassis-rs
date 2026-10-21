//! Preferences in the page (3.12.0): the values ride in every signed-in HTML
//! page before the page's own scripts, for the kit's pages and for a web
//! app's index, and the browser script passes its own node tests.
#![cfg(all(feature = "testing", feature = "storage"))]

use std::sync::{Arc, Mutex};

use axum::Router;
use chassis::AppSpec;
use chassis::storage::{AppDb, AppDbSpec, BrowserKeys};
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

fn homelab_keys() -> BrowserKeys {
    BrowserKeys::new()
        .prefix("homelab.")
        .prefix("homelab-")
        .prefix("kp-remember:")
        .session_prefix("kp-unsaved:")
        .except_exact("homelab.theme-light")
}

async fn start(name: &'static str, env: &[(&str, &str)]) -> (TestApp, AppDb) {
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

async fn put(app: &TestApp, key: &str, value: &str) -> (u16, Value) {
    app.json(
        Method::PUT,
        &format!("/api/kit/prefs/{key}"),
        Some(json!({ "value": value })),
    )
    .await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn signed_in_pages_carry_the_values_before_their_own_scripts() {
    let _one = SERIAL.lock().await;
    let mut h = start("prefs6", &[]).await;
    let app = &h.0;
    put(app, "homelab-toured", "1").await;
    put(
        app,
        "kp-unsaved%3A/settings%3Asettings",
        r#"{"a":"</script>"}"#,
    )
    .await;
    let (s, html) = app.page("/status").await;
    assert_eq!(s, 200);
    let head = html.find("<head>").expect("head");
    let block = html
        .find("id=\"chassis-prefs\"")
        .expect("the values are in the page");
    let boot = html.find("/static/prefs-boot.js").expect("the script");
    let theme = html.find("/static/theme-boot.js").expect("theme boot");
    assert!(
        head < block && block < boot && boot < theme,
        "values, apply, then everything else"
    );
    assert!(html.contains("homelab-toured"));
    assert!(
        !html.contains("</script>\"}"),
        "a value cannot close the block"
    );
    // The login page (no session) carries nothing.
    let anon = reqwest::get(app.url("/login"))
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert!(!anon.contains("chassis-prefs"));
    // The script is served.
    let js = reqwest::get(app.url("/static/prefs-boot.js"))
        .await
        .unwrap();
    assert_eq!(js.status().as_u16(), 200);
    h.0.shutdown().await;
}

/// The project's own web app gets the values too: no change to its
/// index.html, the kit injects them after `<head>`, and a conditional
/// request cannot bring back a stale copy.
#[cfg(feature = "webapp")]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_web_apps_index_carries_the_values_and_is_never_a_304() {
    use chassis::shell::webapp::WebApp;
    let _one = SERIAL.lock().await;
    const FILES: &[(&str, &[u8])] = &[
        (
            "index.html",
            b"<!doctype html><html><head><title>a</title></head><body>app</body></html>",
        ),
        ("js/main.js", b"export const x = 1;"),
    ];
    let mut app = TestApp::start_with(spec("prefs12"), Router::new(), |app| {
        app.app_db(AppDbSpec::new(Vec::new())).unwrap();
        app.sync_browser_keys(homelab_keys());
        app.webapp(WebApp::embedded(FILES));
    })
    .await;
    app.login().await;
    put(&app, "homelab-toured", "1").await;
    let (s, html) = app.page("/").await;
    assert_eq!(s, 200);
    assert!(html.starts_with(
        "<!doctype html><html><head><script type=\"application/json\" id=\"chassis-prefs\">"
    ));
    assert!(html.contains("homelab-toured"));
    let r = app
        .request(Method::GET, "/")
        .header("If-None-Match", "*")
        .header("Accept", "text/html")
        .send()
        .await
        .unwrap();
    assert_eq!(
        r.status().as_u16(),
        200,
        "a conditional request is answered in full"
    );
    assert_eq!(r.headers()["cache-control"], "no-store");
    // A script of the app is untouched.
    let js = app
        .request(Method::GET, "/js/main.js")
        .send()
        .await
        .unwrap();
    assert_eq!(js.text().await.unwrap(), "export const x = 1;");
    app.shutdown().await;
}

/// The browser script's own tests (node), including the shared rule table.
#[test]
fn the_browser_script_passes_its_node_tests() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/js");
    let out = std::process::Command::new("node")
        .args(["--test", dir])
        .output()
        .expect("node is needed for the browser script's tests");
    assert!(
        out.status.success(),
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
}
