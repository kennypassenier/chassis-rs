//! The full-pause request layer: answers every request but the probes with
//! 503 while a [`Mode::Full`] pause is in force. Its own module because it is
//! the one piece of the backup pause that sits in the HTTP stack.

use super::*;

/// The probes a full pause still answers, so the supervisor and the
/// monitor see a paused service as alive.
const PROBES: &[&str] = &["/healthz", "/readyz", "/metrics"];

/// Answer every request but the probes with 503 while a full pause is in
/// force; outside one the layer only reads a flag.
pub(crate) fn full_pause_layer(router: axum::Router) -> axum::Router {
    router.layer(axum::middleware::from_fn(hold_requests))
}

async fn hold_requests(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    let left = {
        let s = state();
        (s.paused && s.full).then(|| {
            s.until
                .map_or(1, |u| u.saturating_duration_since(Instant::now()).as_secs())
                .max(1)
        })
    };
    match left {
        Some(left) if !PROBES.contains(&req.uri().path()) => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            [(axum::http::header::RETRY_AFTER, left.to_string())],
            axum::Json(serde_json::json!({
                "error": "paused for a backup",
                "remedy": format!("retry after {left} s"),
            })),
        )
            .into_response(),
        _ => next.run(req).await,
    }
}
