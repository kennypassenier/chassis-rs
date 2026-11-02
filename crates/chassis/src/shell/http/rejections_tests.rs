//! [fix-rejection-json-1]: extractor rejections answer in the kit's shape.

use super::*;
use axum::Json;
use axum::extract::{Path, Query};
use axum::routing::{get, post};
use serde::Deserialize;
use tower::ServiceExt;

#[derive(Deserialize)]
struct Q {
    #[allow(dead_code)]
    now: u64,
}

#[derive(Deserialize)]
struct Payload {
    #[allow(dead_code)]
    name: String,
}

fn app() -> Router {
    Router::new()
        .route("/q", get(|_: Query<Q>| async { "ok" }))
        .route("/j", post(|_: Json<Payload>| async { "ok" }))
        .route("/p/{n}", get(|Path(_n): Path<u32>| async { "ok" }))
        .route(
            "/own",
            get(|| async { (StatusCode::BAD_REQUEST, "my own plain text") }),
        )
        .layer(middleware::from_fn(rejections::json_rejections))
}

async fn send(req: Request) -> (StatusCode, String, String) {
    let res = app().oneshot(req).await.unwrap();
    let status = res.status();
    let ct = res
        .headers()
        .get("content-type")
        .map(|v| v.to_str().unwrap().to_string())
        .unwrap_or_default();
    let bytes = axum::body::to_bytes(res.into_body(), 1 << 16)
        .await
        .unwrap();
    (status, ct, String::from_utf8(bytes.to_vec()).unwrap())
}

fn json_req(body: &str, content_type: Option<&str>) -> Request {
    let mut b = Request::post("/j");
    if let Some(ct) = content_type {
        b = b.header("content-type", ct);
    }
    b.body(Body::from(body.to_string())).unwrap()
}

#[tokio::test]
async fn extractor_rejections_become_kit_json_with_the_same_status() {
    let cases = [
        (
            Request::get("/q").body(Body::empty()).unwrap(),
            StatusCode::BAD_REQUEST,
        ),
        (
            json_req("{}", Some("application/json")),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
        (
            json_req("{", Some("application/json")),
            StatusCode::BAD_REQUEST,
        ),
        (json_req("{}", None), StatusCode::UNSUPPORTED_MEDIA_TYPE),
        (
            Request::get("/p/notanumber").body(Body::empty()).unwrap(),
            StatusCode::BAD_REQUEST,
        ),
    ];
    for (req, want) in cases {
        let uri = req.uri().clone();
        let (status, ct, body) = send(req).await;
        println!("AFTER {uri}: {status} {ct} {body}");
        assert_eq!(status, want, "{uri}");
        assert!(ct.starts_with("application/json"), "{uri}: {ct}");
        let v: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert!(v["error"].as_str().is_some_and(|e| !e.is_empty()), "{body}");
        assert!(
            v["remedy"].as_str().is_some_and(|r| !r.is_empty()),
            "{body}"
        );
    }
}

#[tokio::test]
async fn a_handlers_own_plain_text_error_is_left_alone() {
    let (status, ct, body) = send(Request::get("/own").body(Body::empty()).unwrap()).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(ct.starts_with("text/plain"), "{ct}");
    assert_eq!(body, "my own plain text");
}
