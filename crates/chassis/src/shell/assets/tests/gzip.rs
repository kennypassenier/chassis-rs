//! The kit's static responses are gzipped when the browser asks (a 1.9 MB
//! bundle travels as ~0.55 MB), only for text types, with a correct ETag.

use super::*;
use axum::Router;
use axum::body::Body;
use axum::http::Request;
use axum::routing::get;
use tower::ServiceExt;

fn static_router() -> Router {
    crate::shell::compress::compressed(
        Router::new().route("/static/{*name}", get(serve_conditional)),
    )
}

async fn fetch(path: &str, headers: &[(&str, &str)]) -> axum::response::Response {
    let mut req = Request::get(path);
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    static_router()
        .oneshot(req.body(Body::empty()).unwrap())
        .await
        .unwrap()
}

#[tokio::test]
async fn the_bundle_is_served_gzip_when_asked() {
    let raw = ASSETS
        .iter()
        .find(|(n, _, _)| *n == "kp/dist/kp-themes.min.js")
        .expect("bundle")
        .2;
    let res = fetch(
        "/static/kp/dist/kp-themes.min.js?v=x",
        &[("accept-encoding", "gzip")],
    )
    .await;
    assert_eq!(res.headers()["content-encoding"], "gzip");
    assert_eq!(res.headers()["vary"], "accept-encoding");
    let body = axum::body::to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap();
    assert_eq!(body[..2], [0x1f, 0x8b], "a gzip stream");
    assert!(
        body.len() * 2 < raw.len(),
        "{} of {}",
        body.len(),
        raw.len()
    );
}

#[tokio::test]
async fn nothing_is_compressed_unless_asked_and_fonts_never() {
    let plain = fetch("/static/kp/dist/kp-themes.min.js?v=x", &[]).await;
    assert!(!plain.headers().contains_key("content-encoding"));
    let font = ASSETS
        .iter()
        .find(|(n, _, _)| n.ends_with(".woff2"))
        .expect("a font")
        .0;
    let res = fetch(
        &format!("/static/{font}?v=x"),
        &[("accept-encoding", "gzip")],
    )
    .await;
    assert!(
        !res.headers().contains_key("content-encoding"),
        "woff2 is already compressed"
    );
}

#[tokio::test]
async fn revalidation_still_answers_304_with_gzip() {
    let path = "/static/kp/dist/kp-themes.min.js";
    let first = fetch(path, &[("accept-encoding", "gzip")]).await;
    let etag = first.headers()["etag"].to_str().unwrap().to_string();
    assert!(
        etag.starts_with("W/\""),
        "a compressed answer's ETag is weak: {etag}"
    );
    let again = fetch(
        path,
        &[("accept-encoding", "gzip"), ("if-none-match", &etag)],
    )
    .await;
    assert_eq!(again.status(), StatusCode::NOT_MODIFIED);
}
