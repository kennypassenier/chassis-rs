//! The HTTP layer every service shares (W1, K3/AR4, AR13): a request-id
//! on every request, one access log line per request, and the kit's
//! error type rendered as JSON with its remedy.
//!
//! The request-id is accepted from the `x-request-id` header when
//! present (Traefik sets one) and generated otherwise, then echoed on the
//! response so a log line and a reply can be matched. It travels in the
//! response header rather than in error bodies: a body is written by the
//! handler, which does not always have the id at hand, while the header
//! is added by a layer that always does.

use std::time::Instant;

use axum::Router;
use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use tower_http::request_id::{
    MakeRequestId, PropagateRequestIdLayer, RequestId, SetRequestIdLayer,
};

use crate::core::error::{Error, Kind};

static X_REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");

/// A fresh UUIDv4 per request when the caller sent none.
#[derive(Clone, Copy, Default)]
struct MakeUuid;

impl MakeRequestId for MakeUuid {
    fn make_request_id<B>(&mut self, _: &axum::http::Request<B>) -> Option<RequestId> {
        let id = uuid::Uuid::new_v4().to_string();
        HeaderValue::from_str(&id).ok().map(RequestId::new)
    }
}

/// Wrap a router with the kit's layers, outermost last: set the id,
/// log the request, propagate the id onto the response.
pub fn with_kit_layers(router: Router) -> Router {
    router
        .layer(middleware::from_fn(access_log))
        .layer(PropagateRequestIdLayer::new(X_REQUEST_ID.clone()))
        .layer(SetRequestIdLayer::new(X_REQUEST_ID.clone(), MakeUuid))
}

/// One line per request at `info` (K4), carrying the request id.
async fn access_log(req: Request<Body>, next: Next) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let request_id = req
        .extensions()
        .get::<RequestId>()
        .and_then(|id| id.header_value().to_str().ok())
        .unwrap_or("-")
        .to_string();
    let started = Instant::now();
    let response = next.run(req).await;
    tracing::info!(
        method = %method,
        path = %path,
        status = response.status().as_u16(),
        duration_ms = started.elapsed().as_millis() as u64,
        request_id = %request_id,
        "request"
    );
    response
}

impl Kind {
    /// The status each kind answers with (AR4).
    pub fn status(self) -> StatusCode {
        match self {
            Kind::Config => StatusCode::SERVICE_UNAVAILABLE,
            Kind::Unauthorized => StatusCode::UNAUTHORIZED,
            Kind::NotFound => StatusCode::NOT_FOUND,
            Kind::Invalid => StatusCode::BAD_REQUEST,
            Kind::Overloaded => StatusCode::SERVICE_UNAVAILABLE,
            Kind::Dependency => StatusCode::BAD_GATEWAY,
            Kind::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl IntoResponse for Error {
    /// `{"error": …, "remedy": …}` with the kind's status. Internal errors
    /// keep their remedy but the message is logged, not leaked: the caller
    /// cannot act on a stack of ours, and it may name paths.
    fn into_response(self) -> Response {
        let status = self.kind.status();
        let message = if self.kind == Kind::Internal {
            tracing::error!(error = %self, "internal error");
            "internal error".to_string()
        } else {
            self.message
        };
        let body = serde_json::json!({ "error": message, "remedy": self.remedy });
        (status, axum::Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::get;
    use tower::ServiceExt;

    #[tokio::test]
    async fn request_id_is_generated_or_echoed() {
        let app = with_kit_layers(Router::new().route("/", get(|| async { "ok" })));
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
}
