//! Unit tests for `http`; kept in their own file so the module stays small.

use super::*;
use crate::core::error::{Error, Kind};
use axum::routing::get;
use tower::ServiceExt;

#[tokio::test]
async fn request_id_is_generated_or_echoed() {
    let app = with_request_id_only(Router::new().route("/", get(|| async { "ok" })));
    let res = app
        .clone()
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let generated = res
        .headers()
        .get("x-request-id")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert_eq!(generated.len(), 36, "uuid v4 text form");

    let res = app
        .oneshot(
            Request::builder()
                .uri("/")
                .header("x-request-id", "abc-123")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.headers().get("x-request-id").unwrap(), "abc-123");
}

#[tokio::test]
async fn error_renders_json_with_remedy_and_status() {
    async fn failing() -> Result<&'static str, Error> {
        Err(Error::new(
            Kind::NotFound,
            "no such client",
            "issue one on /clients first",
        ))
    }
    let app = Router::new().route("/", get(failing));
    let res = app
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
    let bytes = axum::body::to_bytes(res.into_body(), 4096).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(v["error"], "no such client");
    assert_eq!(v["remedy"], "issue one on /clients first");
}

#[tokio::test]
async fn internal_error_hides_its_message() {
    async fn failing() -> Result<&'static str, Error> {
        Err(Error::internal(
            "/var/lib/secret/path exploded",
            "retry; if it persists read the log",
        ))
    }
    let app = Router::new().route("/", get(failing));
    let res = app
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let bytes = axum::body::to_bytes(res.into_body(), 4096).await.unwrap();
    let text = String::from_utf8(bytes.to_vec()).unwrap();
    assert!(!text.contains("/var/lib"));
    assert!(text.contains("retry"));
}

/// CF-7: a browser navigation gets the refusal as a page, a script the JSON.
#[tokio::test]
async fn navigations_get_errors_as_pages_and_scripts_get_json() {
    let render: HtmlErrorRenderer = std::sync::Arc::new(|status, msg, remedy| {
        Some(format!(
            "<html>{} · {msg} · {remedy}</html>",
            status.as_u16()
        ))
    });
    let app = Router::new()
        .route(
            "/act",
            axum::routing::post(|| async {
                (
                    StatusCode::FORBIDDEN,
                    axum::Json(serde_json::json!({
                        "error": "cross-site request refused",
                        "remedy": "use the dashboard"
                    })),
                )
            }),
        )
        .layer(middleware::from_fn_with_state(Some(render), html_errors));
    let nav = Request::builder()
        .method("POST")
        .uri("/act")
        .header("sec-fetch-mode", "navigate")
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(nav).await.unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN, "the status is kept");
    assert!(
        res.headers()[axum::http::header::CONTENT_TYPE]
            .to_str()
            .unwrap()
            .starts_with("text/html")
    );
    let body = axum::body::to_bytes(res.into_body(), 4096).await.unwrap();
    let body = String::from_utf8(body.to_vec()).unwrap();
    assert!(
        body.contains("403 · cross-site request refused · use the dashboard"),
        "{body}"
    );

    let script = Request::builder()
        .method("POST")
        .uri("/act")
        .body(Body::empty())
        .unwrap();
    let res = app.oneshot(script).await.unwrap();
    assert!(
        res.headers()[axum::http::header::CONTENT_TYPE]
            .to_str()
            .unwrap()
            .starts_with("application/json"),
        "a script keeps the JSON shape"
    );
    let body = axum::body::to_bytes(res.into_body(), 4096).await.unwrap();
    assert!(String::from_utf8_lossy(&body).contains("\"remedy\""));
}

/// kit-kp11: the renderer sees the request id and the headers of the
/// request it answers, and nothing of them afterwards.
#[tokio::test]
async fn the_error_page_renderer_sees_the_request_id_and_cookie() {
    let render: HtmlErrorRenderer = std::sync::Arc::new(|_, _, _| {
        let ctx = error_context();
        Some(format!(
            "<html>{} · {}</html>",
            ctx.request_id.unwrap_or_default(),
            ctx.headers
                .get("cookie")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("none")
        ))
    });
    let app = Router::new()
        .route(
            "/act",
            axum::routing::get(|| async {
                (
                    StatusCode::NOT_FOUND,
                    axum::Json(serde_json::json!({ "error": "gone", "remedy": "look again" })),
                )
            }),
        )
        .layer(middleware::from_fn_with_state(Some(render), html_errors));
    let req = Request::builder()
        .uri("/act")
        .header("sec-fetch-mode", "navigate")
        .header("x-request-id", "req-42")
        .header("cookie", "inbox_session=abc")
        .body(Body::empty())
        .unwrap();
    let res = app.oneshot(req).await.unwrap();
    let body = axum::body::to_bytes(res.into_body(), 4096).await.unwrap();
    assert_eq!(
        String::from_utf8(body.to_vec()).unwrap(),
        "<html>req-42 · inbox_session=abc</html>"
    );
    assert!(
        error_context().request_id.is_none() && error_context().headers.is_empty(),
        "the context ends with the render"
    );
}

/// The cap also holds for a body that declares no length: the router sees
/// the bytes cross the limit while the handler reads them.
#[tokio::test]
async fn body_limit_counts_streamed_bytes_and_picks_the_longest_prefix() {
    let limits = BodyLimits::new(8, vec![("/in".into(), 64), ("/in/small".into(), 4)]).unwrap();
    assert_eq!(limits.for_path("/x"), 8);
    assert_eq!(limits.for_path("/in/a"), 64);
    assert_eq!(limits.for_path("/in/small/a"), 4);
    assert_eq!(limits.for_path("/ins"), 8, "whole segments only");

    let app = Router::new()
        .route(
            "/in",
            axum::routing::post(|b: axum::body::Bytes| async move { b.len().to_string() }),
        )
        .layer(middleware::from_fn_with_state(
            limits,
            body_limit::body_limit,
        ));
    // No content-length header: only the streamed count can refuse it.
    let send = |n: usize| {
        Request::builder()
            .method("POST")
            .uri("/in")
            .body(Body::from(vec![b'x'; n]))
            .unwrap()
    };
    let ok = app.clone().oneshot(send(40)).await.unwrap();
    assert_eq!(ok.status(), StatusCode::OK);
    let over = app.oneshot(send(65)).await.unwrap();
    assert_eq!(over.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

/// [fix-no-store-1]: a JSON answer is `no-store` unless the handler chose.
#[tokio::test]
async fn json_answers_default_to_no_store() {
    use axum::Json;
    use axum::http::header::CACHE_CONTROL;
    let app = Router::new()
        .route("/j", get(|| async { Json(serde_json::json!({"a": 1})) }))
        .route(
            "/own",
            get(|| async { ([(CACHE_CONTROL, "no-cache")], Json(serde_json::json!({}))) }),
        )
        .route("/text", get(|| async { "plain" }))
        .layer(middleware::from_fn(security_headers));
    let cc = |path: &'static str| {
        let app = app.clone();
        async move {
            let res = app
                .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
                .await
                .unwrap();
            res.headers()
                .get(CACHE_CONTROL)
                .map(|v| v.to_str().unwrap().to_string())
        }
    };
    println!("AFTER: /j cache-control = {:?}", cc("/j").await);
    assert_eq!(cc("/j").await.as_deref(), Some("no-store"));
    assert_eq!(
        cc("/own").await.as_deref(),
        Some("no-cache"),
        "handler wins"
    );
    assert_eq!(cc("/text").await, None, "only JSON is defaulted");
}
