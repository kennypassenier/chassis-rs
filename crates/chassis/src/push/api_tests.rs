//! The API without the login layer (the mount adds it): subscribe,
//! unsubscribe, the public key, and the refusals.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;

use super::api::{PushState, routes};
use crate::storage::push_store::PushStore;

const P256DH: &str =
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const AUTH: &str = "BTBZMqHH6r4Tts7J_aSIgg";

fn app(cap: usize) -> (tempfile::TempDir, PushStore, axum::Router) {
    let dir = tempfile::tempdir().unwrap();
    let db = crate::storage::Db::open(
        &dir.path().join("svc-kit.db"),
        &crate::storage::kit_migrations(),
    )
    .unwrap();
    let store = PushStore::new(db, cap);
    let state = PushState {
        store: store.clone(),
        public_key: "PUBLIC-KEY".into(),
    };
    (dir, store, routes(state))
}

async fn call(router: &axum::Router, method: &str, path: &str, body: Value) -> (StatusCode, Value) {
    let req = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    let res = router.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = axum::body::to_bytes(res.into_body(), 1 << 20)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

fn sub(endpoint: &str) -> Value {
    json!({"endpoint": endpoint, "keys": {"p256dh": P256DH, "auth": AUTH}})
}

#[tokio::test]
async fn the_public_key_is_served() {
    let (_d, _s, router) = app(5);
    let (status, body) = call(&router, "GET", "/api/kit/push/key", Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({"public_key": "PUBLIC-KEY"}));
}

#[tokio::test]
async fn subscribing_stores_once_and_a_repeat_renews() {
    let (_d, store, router) = app(5);
    let path = "/api/kit/push/subscribe";
    let (status, body) = call(&router, "POST", path, sub("https://push.example/a")).await;
    assert_eq!(
        (status, &body["created"], &body["count"]),
        (StatusCode::OK, &json!(true), &json!(1))
    );
    let (_, again) = call(&router, "POST", path, sub("https://push.example/a")).await;
    assert_eq!(
        (&again["created"], &again["count"]),
        (&json!(false), &json!(1))
    );
    assert_eq!(store.all().unwrap().len(), 1);
}

#[tokio::test]
async fn http_endpoints_and_bad_keys_are_refused_and_nothing_is_stored() {
    let (_d, store, router) = app(5);
    let path = "/api/kit/push/subscribe";
    let (status, body) = call(&router, "POST", path, sub("http://push.example/a")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body.to_string().contains("https"), "{body}");
    let bad =
        json!({"endpoint": "https://push.example/a", "keys": {"p256dh": "AAAA", "auth": AUTH}});
    let (status, _) = call(&router, "POST", path, bad).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = call(
        &router,
        "POST",
        path,
        json!({"endpoint": "https://push.example/a"}),
    )
    .await;
    assert!(status.is_client_error(), "a body without keys: {status}");
    assert!(store.all().unwrap().is_empty());
}

#[tokio::test]
async fn the_cap_answers_a_client_error_with_the_remedy() {
    let (_d, _s, router) = app(1);
    let path = "/api/kit/push/subscribe";
    call(&router, "POST", path, sub("https://push.example/a")).await;
    let (status, body) = call(&router, "POST", path, sub("https://push.example/b")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        body.to_string().contains("push_max_subscriptions"),
        "{body}"
    );
}

#[tokio::test]
async fn unsubscribing_removes_by_endpoint_and_is_harmless_twice() {
    let (_d, store, router) = app(5);
    call(
        &router,
        "POST",
        "/api/kit/push/subscribe",
        sub("https://push.example/a"),
    )
    .await;
    let path = "/api/kit/push/unsubscribe";
    let body = json!({"endpoint": "https://push.example/a"});
    let (status, out) = call(&router, "POST", path, body.clone()).await;
    assert_eq!((status, out), (StatusCode::OK, json!({"removed": true})));
    let (_, out) = call(&router, "POST", path, body).await;
    assert_eq!(out, json!({"removed": false}));
    assert!(store.all().unwrap().is_empty());
}
