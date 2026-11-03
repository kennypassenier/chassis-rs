//! Kenny, 2026-11-03: inline styles never happen. The policy the kit sends
//! on every response must not allow them.

use super::*;
use axum::routing::get;
use tower::ServiceExt;

#[tokio::test]
async fn the_policy_allows_no_inline_styles() {
    let app = Router::new()
        .route("/", get(|| async { "ok" }))
        .layer(middleware::from_fn(security_headers));
    let res = app
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let csp = res.headers()["content-security-policy"].to_str().unwrap();
    let style_src = csp
        .split(';')
        .map(str::trim)
        .find(|d| d.starts_with("style-src"))
        .expect("the policy has a style-src");
    assert_eq!(style_src, "style-src 'self'", "{csp}");
    assert!(!csp.contains("unsafe-inline"), "{csp}");
}

/// The kp-themes import map is an inline script, allowed by its hash and by
/// nothing wider: `script-src` names `'self'` and one `sha256-…`, never
/// `'unsafe-inline'`.
#[tokio::test]
async fn script_src_carries_the_import_map_hash_and_nothing_wider() {
    let app = Router::new()
        .route("/", get(|| async { "ok" }))
        .layer(middleware::from_fn(security_headers));
    let res = app
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let csp = res.headers()["content-security-policy"].to_str().unwrap();
    let script_src = csp
        .split(';')
        .map(str::trim)
        .find(|d| d.starts_with("script-src"))
        .expect("the policy has a script-src");
    let sources: Vec<&str> = script_src.split_whitespace().skip(1).collect();
    assert_eq!(sources.len(), 2, "{script_src}");
    assert_eq!(sources[0], "'self'");
    assert!(sources[1].starts_with("'sha256-"), "{script_src}");
}
