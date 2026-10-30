//! Unit tests for `captures`; kept in their own file so the module stays small.

use super::*;
use axum::http::{HeaderMap, HeaderValue};

fn cfg() -> CaptureConfig {
    CaptureConfig {
        keep: 2,
        body_bytes: 8,
        ttl: Duration::from_secs(3600),
        redact: vec!["x-secret-thing".into()],
    }
}

#[test]
fn redacts_truncates_and_keeps_only_n() {
    let c = Captures::new(cfg());
    let mut h = HeaderMap::new();
    h.insert("authorization", HeaderValue::from_static("Bearer hunter2"));
    h.insert("x-secret-thing", HeaderValue::from_static("shh"));
    h.insert("content-type", HeaderValue::from_static("application/json"));
    c.record(
        "id",
        "POST",
        "/v1/messages",
        &h,
        b"0123456789abcdef",
        202,
        "api",
    );
    let list = c.list("id");
    assert_eq!(list.len(), 1);
    let cap = &list[0];
    assert!(
        cap.headers
            .iter()
            .any(|(k, v)| k == "authorization" && v == "***")
    );
    assert!(
        cap.headers
            .iter()
            .any(|(k, v)| k == "x-secret-thing" && v == "***")
    );
    assert!(
        cap.headers
            .iter()
            .any(|(k, v)| k == "content-type" && v == "application/json")
    );
    assert_eq!(cap.body, "01234567");
    assert!(cap.truncated);
    assert_eq!(cap.body_bytes, 16);
    assert_eq!(cap.status, 202);

    c.record("id", "GET", "/a", &HeaderMap::new(), b"", 200, "api");
    c.record("id", "GET", "/b", &HeaderMap::new(), b"", 200, "test");
    let list = c.list("id");
    assert_eq!(list.len(), 2, "ring keeps the last two");
    assert_eq!(list[0].path, "/b", "newest first");
    assert_eq!(list[0].source, "test");
    assert!(c.list("other").is_empty());
    c.forget("id");
    assert!(c.list("id").is_empty());
}

#[test]
fn expired_captures_disappear() {
    let mut cfg = cfg();
    cfg.ttl = Duration::from_secs(0);
    let c = Captures::new(cfg);
    c.record("id", "GET", "/", &HeaderMap::new(), b"", 200, "api");
    assert!(c.list("id").is_empty(), "a zero TTL expires at once");
}

/// kit-kp11: the dashboard's JSON keeps one casing, snake_case, in every
/// field (`body_bytes`, not `bodyBytes`), and says where a request came from.
#[test]
fn a_capture_serialises_in_snake_case_with_its_source() {
    let c = Captures::new(cfg());
    c.record("id", "POST", "/v1/x", &HeaderMap::new(), b"{}", 202, "test");
    let v = serde_json::to_value(&c.list("id")[0]).unwrap();
    let keys: Vec<&str> = v.as_object().unwrap().keys().map(String::as_str).collect();
    for key in keys {
        assert!(
            key.chars().all(|ch| ch.is_ascii_lowercase() || ch == '_'),
            "field `{key}` is not snake_case"
        );
    }
    assert_eq!(v["body_bytes"], 2);
    assert_eq!(v["source"], "test");
}

/// kit-kp11: the test button's request is filed as `test`, a real call as `api`.
#[tokio::test]
async fn the_test_header_files_a_request_as_a_test() {
    use axum::{Router, body::Body, middleware::from_fn_with_state, routing::post};
    use tower::ServiceExt;

    let captures = Captures::new(cfg());
    let app = Router::new()
        .route("/v1/x", post(|| async { "ok" }))
        .layer(from_fn_with_state(captures.clone(), capture_requests))
        .layer(axum::middleware::from_fn(
            |mut req: Request<Body>, next: Next| async move {
                req.extensions_mut().insert(Caller::Client {
                    id: "id".into(),
                    name: "n".into(),
                });
                next.run(req).await
            },
        ));
    let key = captures.test_key().to_string();
    for header in [Some(key.as_str()), None] {
        let mut req = Request::post("/v1/x");
        if let Some(v) = header {
            req = req.header(TEST_HEADER, v);
        }
        let res = app
            .clone()
            .oneshot(req.body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), 200);
    }
    let list = captures.list("id");
    assert_eq!(list[0].source, "api", "newest first");
    assert_eq!(list[1].source, "test");
}

/// kit-kp11: any client can send the header; only the dashboard's own
/// key makes a request a test. Outside values are recorded as `api`.
#[tokio::test]
async fn an_outside_test_header_is_recorded_as_api() {
    use axum::{Router, body::Body, middleware::from_fn_with_state, routing::post};
    use tower::ServiceExt;

    let captures = Captures::new(cfg());
    let app = Router::new()
        .route("/v1/x", post(|| async { "ok" }))
        .layer(from_fn_with_state(captures.clone(), capture_requests))
        .layer(axum::middleware::from_fn(
            |mut req: Request<Body>, next: Next| async move {
                req.extensions_mut().insert(Caller::Client {
                    id: "id".into(),
                    name: "n".into(),
                });
                next.run(req).await
            },
        ));
    for value in ["1", "true", ""] {
        let req = Request::post("/v1/x")
            .header(TEST_HEADER, value)
            .body(Body::empty())
            .unwrap();
        assert_eq!(app.clone().oneshot(req).await.unwrap().status(), 200);
    }
    let list = captures.list("id");
    assert_eq!(list.len(), 2, "ring keeps two of the three");
    assert!(list.iter().all(|c| c.source == "api"));
    assert!(
        list.iter()
            .flat_map(|c| &c.headers)
            .all(|(k, v)| k != TEST_HEADER || v == "***"),
        "the header is never shown"
    );
}
