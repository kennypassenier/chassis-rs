//! The kit extractors answer the kit's JSON shape on their own, with no layer.

use super::extractors::{ApiJson, ApiPath, ApiQuery};
use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::routing::{get, post};
use serde::Deserialize;
use tower::ServiceExt;

#[derive(Deserialize)]
struct Q {
    now: u64,
}

fn app() -> Router {
    Router::new()
        .route(
            "/q",
            get(|ApiQuery(q): ApiQuery<Q>| async move { q.now.to_string() }),
        )
        .route(
            "/j",
            post(|ApiJson(q): ApiJson<Q>| async move { q.now.to_string() }),
        )
        .route(
            "/p/{n}",
            get(|ApiPath(n): ApiPath<u32>| async move { n.to_string() }),
        )
}

async fn send(req: Request<Body>) -> (StatusCode, String, String) {
    let res = app().oneshot(req).await.unwrap();
    let (s, ct) = (
        res.status(),
        res.headers()["content-type"].to_str().unwrap().to_string(),
    );
    let b = axum::body::to_bytes(res.into_body(), 1 << 16)
        .await
        .unwrap();
    (s, ct, String::from_utf8(b.to_vec()).unwrap())
}

#[tokio::test]
async fn kit_extractors_pass_good_input_and_refuse_bad_input_as_json() {
    let ok = send(Request::get("/q?now=7").body(Body::empty()).unwrap()).await;
    assert_eq!((ok.0, ok.2.as_str()), (StatusCode::OK, "7"));
    let ok = send(Request::get("/p/9").body(Body::empty()).unwrap()).await;
    assert_eq!(ok.2, "9");
    let json = |body: &str, ct: Option<&str>| {
        let mut b = Request::post("/j");
        if let Some(ct) = ct {
            b = b.header("content-type", ct);
        }
        b.body(Body::from(body.to_string())).unwrap()
    };
    let bad = [
        (Request::get("/q").body(Body::empty()).unwrap(), 400),
        (Request::get("/p/x").body(Body::empty()).unwrap(), 400),
        (json("{}", Some("application/json")), 422),
        (json("{", Some("application/json")), 400),
        (json("{}", None), 415),
    ];
    for (req, want) in bad {
        let uri = req.uri().clone();
        let (s, ct, body) = send(req).await;
        println!("{uri}: {s} {body}");
        assert_eq!(s.as_u16(), want, "{uri}");
        assert!(ct.starts_with("application/json"), "{uri}");
        let v: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert!(v["error"].is_string() && v["remedy"].is_string(), "{body}");
    }
}
