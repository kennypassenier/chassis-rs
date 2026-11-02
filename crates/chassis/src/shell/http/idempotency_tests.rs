//! The `Idempotency-Key` extractor through a router (feat-offline-post-1).

use super::idempotency::IdempotencyKey;
use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::routing::post;
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

async fn take(key: IdempotencyKey) -> String {
    key.get().map_or("none".into(), |k| k.to_string())
}

async fn send(key: Option<&str>) -> (StatusCode, String) {
    let mut req = Request::builder().method("POST").uri("/take");
    if let Some(k) = key {
        req = req.header("idempotency-key", k);
    }
    let res = Router::new()
        .route("/take", post(take))
        .oneshot(req.body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}

#[tokio::test]
async fn a_missing_key_is_none_and_a_uuid_is_passed_on() {
    assert_eq!(send(None).await, (StatusCode::OK, "none".into()));
    let k = "3f2b8c1e-5a4d-4e0a-9b1c-2d7e6f8a9b0c";
    assert_eq!(send(Some(k)).await, (StatusCode::OK, k.into()));
}

#[tokio::test]
async fn a_malformed_key_is_a_400_in_the_kit_shape() {
    let (status, body) = send(Some("not-a-uuid")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let json: Value = serde_json::from_str(&body).unwrap();
    assert!(json["error"].is_string() && json["remedy"].is_string());
}
