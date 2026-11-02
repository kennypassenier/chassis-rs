//! The data-route helper end to end through a router (feat-offline-1).

use super::revision::{Conflict, IfMatch, Revisioned};
use axum::Router;
use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode, header};
use axum::routing::get;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use tower::ServiceExt;

type Item = Arc<Mutex<(u64, Value)>>;

async fn read(State(item): State<Item>) -> Revisioned<Value> {
    let (rev, v) = item.lock().unwrap().clone();
    Revisioned::new(rev, v)
}

async fn replace(
    State(item): State<Item>,
    if_match: IfMatch,
    axum::Json(v): axum::Json<Value>,
) -> Result<Revisioned<Value>, Conflict> {
    let mut g = item.lock().unwrap();
    if_match.check(g.0).map_err(|c| c.with_item(&g.1))?;
    *g = (g.0 + 1, v.clone());
    Ok(Revisioned::new(g.0, v))
}

fn app() -> Router {
    let item: Item = Arc::new(Mutex::new((3, json!({"name": "soup"}))));
    Router::new()
        .route("/dish", get(read).put(replace))
        .with_state(item)
}

async fn call(
    app: &Router,
    method: &str,
    if_match: Option<&str>,
) -> (StatusCode, Option<String>, Value) {
    let mut req = Request::builder()
        .method(method)
        .uri("/dish")
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(v) = if_match {
        req = req.header(header::IF_MATCH, v);
    }
    let res = app
        .clone()
        .oneshot(req.body(Body::from(r#"{"name":"stew"}"#)).unwrap())
        .await
        .unwrap();
    let status = res.status();
    let etag = res
        .headers()
        .get(header::ETAG)
        .map(|v| v.to_str().unwrap().to_string());
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        etag,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

#[tokio::test]
async fn an_answer_carries_its_revision_as_etag() {
    let (status, etag, body) = call(&app(), "GET", None).await;
    assert_eq!((status, etag.as_deref()), (StatusCode::OK, Some("\"3\"")));
    assert_eq!(body["name"], "soup");
}

#[tokio::test]
async fn a_matching_if_match_saves_and_raises_the_revision() {
    let app = app();
    for spelling in ["3", "\"4\"", "*"] {
        let (status, etag, _) = call(&app, "PUT", Some(spelling)).await;
        assert_eq!(status, StatusCode::OK, "{spelling}");
        assert!(etag.is_some());
    }
    assert_eq!(call(&app, "GET", None).await.1.as_deref(), Some("\"6\""));
}

#[tokio::test]
async fn a_stale_if_match_is_a_409_in_the_kit_shape_and_changes_nothing() {
    let app = app();
    let (status, etag, body) = call(&app, "PUT", Some("\"2\"")).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(etag.as_deref(), Some("\"3\""));
    assert_eq!(body["code"], "stale");
    assert_eq!(body["rev"], 3);
    assert_eq!(body["current"]["name"], "soup");
    assert!(body["error"].is_string() && body["remedy"].is_string());
    assert_eq!(call(&app, "GET", None).await.2["name"], "soup");
}

#[tokio::test]
async fn no_header_means_no_check_and_a_bad_header_is_a_400_with_a_remedy() {
    let app = app();
    assert_eq!(call(&app, "PUT", None).await.0, StatusCode::OK);
    let (status, _, body) = call(&app, "PUT", Some("banana")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["remedy"].is_string());
}
