//! The access-log middleware: one `info` line and one counter increment per
//! request. Its own module because it is the only code here that touches
//! the metrics registry.

use std::time::Instant;

use axum::body::Body;
use axum::extract::{MatchedPath, Request, State};
use axum::middleware::Next;
use axum::response::Response;
use tower_http::request_id::RequestId;

use super::AccessState;

/// Body of [`super::access_log`].
pub(super) async fn run(
    State(access): State<AccessState>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let route = req
        .extensions()
        .get::<MatchedPath>()
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| "unmatched".to_string());
    let request_id = req
        .extensions()
        .get::<RequestId>()
        .and_then(|id| id.header_value().to_str().ok())
        .unwrap_or("-")
        .to_string();
    let started = Instant::now();
    let response = next.run(req).await;
    let status = response.status().as_u16();
    if !access.requests_total.is_empty() {
        metrics::counter!(
            access.requests_total.clone(),
            "route" => route.clone(),
            "status" => status.to_string()
        )
        .increment(1);
    }
    tracing::info!(
        method = %method,
        path = %path,
        route = %route,
        status,
        duration_ms = started.elapsed().as_millis() as u64,
        request_id = %request_id,
        "request"
    );
    response
}
