//! Locks the injected kp-themes runtime: one tag per HTML page, nothing
//! else touched, caching that follows the injected bytes, an opt-out and
//! sub-path mounts.

use super::tests::{body, get_path};
use super::*;

const HEAD_PAGE: &[u8] = b"<!doctype html><html><head><title>a</title></head><body>x</body></html>";
const BODY_ONLY: &[u8] = b"<html><BODY>x</BODY></html>";
const HAS_TAG: &[u8] = b"<html><head><script type=\"module\" src=\"/static/chassis/webapp-runtime.js\"></script></head></html>";
const FILES: &[(&str, &[u8])] = &[
    ("index.html", HEAD_PAGE),
    ("body.html", BODY_ONLY),
    ("own.html", HAS_TAG),
    ("js/main.js", b"export const x = 'webapp-runtime.js';"),
];

fn count(haystack: &str) -> usize {
    haystack.matches("webapp-runtime.js").count()
}

#[tokio::test]
async fn html_gets_the_tag_once_before_the_head_end() {
    let r = WebApp::embedded(FILES).router().unwrap();
    let res = get_path(&r, "/", &[]).await;
    let len: usize = res.headers()["content-length"]
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let html = body(res).await;
    assert_eq!(len, html.len(), "content-length follows the injected bytes");
    assert_eq!(count(&html), 1);
    assert!(html.contains(&format!("{}</head>", inject::runtime_tag())));
    // The SPA fallback is the same page.
    assert_eq!(
        count(&body(get_path(&r, "/stacks/media", &[]).await).await),
        1
    );
    // No head: before the body end; the match ignores case.
    let html = body(get_path(&r, "/body.html", &[]).await).await;
    assert!(html.contains(&format!("{}</BODY>", inject::runtime_tag())));
}

#[tokio::test]
async fn a_page_that_loads_the_runtime_itself_is_left_alone() {
    let r = WebApp::embedded(FILES).router().unwrap();
    let html = body(get_path(&r, "/own.html", &[]).await).await;
    assert_eq!(html.as_bytes(), HAS_TAG);
    assert_eq!(count(&html), 1);
}

#[tokio::test]
async fn other_files_are_byte_identical() {
    let r = WebApp::embedded(FILES).router().unwrap();
    let res = get_path(&r, "/js/main.js", &[]).await;
    assert_eq!(body(res).await.as_bytes(), FILES[3].1);
}

#[tokio::test]
async fn the_etag_follows_the_injected_bytes_and_304_works() {
    let on = WebApp::embedded(FILES).router().unwrap();
    let off = WebApp::embedded(FILES)
        .without_kit_runtime()
        .router()
        .unwrap();
    let etag = |res: &axum::response::Response| res.headers()["etag"].to_str().unwrap().to_string();
    let injected = etag(&get_path(&on, "/", &[]).await);
    let raw = etag(&get_path(&off, "/", &[]).await);
    assert_ne!(injected, raw, "the validator covers the injected bytes");
    let res = get_path(&on, "/", &[("if-none-match", &injected)]).await;
    assert_eq!(res.status(), 304);
    let res = get_path(&on, "/", &[("if-none-match", &raw)]).await;
    assert_eq!(res.status(), 200, "the raw page's validator does not match");
}

#[tokio::test]
async fn the_opt_out_serves_the_raw_bytes() {
    let r = WebApp::embedded(FILES)
        .without_kit_runtime()
        .router()
        .unwrap();
    let res = get_path(&r, "/", &[]).await;
    assert_eq!(body(res).await.as_bytes(), HEAD_PAGE);
}

#[tokio::test]
async fn a_sub_path_mount_uses_the_absolute_static_path() {
    let r = WebApp::embedded(FILES).at("/ui").router().unwrap();
    let html = body(get_path(&r, "/ui/", &[]).await).await;
    assert_eq!(count(&html), 1);
    assert!(html.contains("src=\"/static/chassis/webapp-runtime.js?v="));
    assert_eq!(count(&body(get_path(&r, "/ui/stacks", &[]).await).await), 1);
}

#[test]
fn the_runtime_file_is_one_the_kit_serves_and_the_csp_allows_it() {
    let served =
        crate::shell::assets::all_assets().any(|(n, _, _)| *n == "chassis/webapp-runtime.js");
    assert!(served, "static/chassis/webapp-runtime.js is embedded");
    assert!(DEFAULT_CSP.contains("script-src 'self'"), "same origin");
}
