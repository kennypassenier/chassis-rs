//! The preferences block must reach a browser that asks for gzip: the web
//! app's HTML is injected before it is compressed, so a real browser (which
//! always sends `Accept-Encoding: gzip`) gets `chassis-prefs` too.
#![cfg(all(feature = "testing", feature = "storage", feature = "webapp"))]

use std::io::Read;

use axum::Router;
use chassis::AppSpec;
use chassis::shell::webapp::WebApp;
use chassis::storage::{AppDbSpec, BrowserKeys};
use chassis::testing::TestApp;
use reqwest::Method;
use serde_json::json;

/// Padded past the compression threshold, so gzip really applies.
fn index_html() -> &'static [u8] {
    let pad = "<!-- padding so the page is worth compressing -->".repeat(20);
    let page =
        format!("<!doctype html><html><head><title>a</title></head><body>{pad}app</body></html>");
    Box::leak(page.into_bytes().into_boxed_slice())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_gzip_browser_gets_the_prefs_block_and_the_head_tags() {
    let files: &'static [(&str, &[u8])] = Box::leak(Box::new([("index.html", index_html())]));
    let mut app = TestApp::start_with(
        AppSpec {
            name: "prefsgz",
            version: "0.0.0",
            ..Default::default()
        },
        Router::new(),
        move |app| {
            app.app_db(AppDbSpec::new(Vec::new())).unwrap();
            app.sync_browser_keys(BrowserKeys::new().prefix("homelab-"));
            app.webapp(WebApp::embedded(files));
        },
    )
    .await;
    app.login().await;
    app.json(
        Method::PUT,
        "/api/kit/prefs/homelab-toured",
        Some(json!({ "value": "1" })),
    )
    .await;
    // reqwest here sends no Accept-Encoding of its own and does not decode.
    let r = app
        .request(Method::GET, "/")
        .header("Accept", "text/html")
        .header("Accept-Encoding", "gzip")
        .send()
        .await
        .unwrap();
    assert_eq!(r.status().as_u16(), 200);
    assert_eq!(
        r.headers()["content-encoding"],
        "gzip",
        "the page travels compressed"
    );
    let raw = r.bytes().await.unwrap();
    let mut html = String::new();
    flate2::read::GzDecoder::new(&raw[..])
        .read_to_string(&mut html)
        .expect("a valid gzip stream");
    assert!(html.contains("id=\"chassis-prefs\""), "prefs block: {html}");
    assert!(html.contains("homelab-toured"));
    assert!(html.contains("/static/prefs-boot.js"));
    assert!(html.contains("<script"), "the runtime/head tags: {html}");
    app.shutdown().await;
}
