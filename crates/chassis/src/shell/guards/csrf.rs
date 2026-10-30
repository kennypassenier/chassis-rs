//! The same-origin (CSRF) rule: `Sec-Fetch-Site` first, `Origin` against
//! `Host` as the fallback. Its own module because it is a self-contained
//! policy with a long rationale, separate from the load-shedding guards.

use axum::body::Body;
use axum::extract::Request;
use axum::http::{Method, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::WithStatus;
use crate::core::error::{Error, Kind};

/// Body of [`super::csrf_guard`].
pub(super) async fn csrf_guard(req: Request<Body>, next: Next) -> Response {
    let safe = matches!(*req.method(), Method::GET | Method::HEAD | Method::OPTIONS);
    let site = req
        .headers()
        .get("sec-fetch-site")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_ascii_lowercase());
    match site.as_deref() {
        _ if safe => {}
        Some("same-origin") | Some("none") => return next.run(req).await,
        Some(other @ ("cross-site" | "same-site")) => {
            return Error::new(
                Kind::Unauthorized,
                format!("cross-site request (Sec-Fetch-Site: {other}) refused"),
                "call this endpoint from the dashboard itself, or from a script without browser fetch metadata",
            )
            .into_response()
            .with_status(StatusCode::FORBIDDEN);
        }
        _ => {}
    }
    if !safe
        && let Some(origin) = req
            .headers()
            .get(header::ORIGIN)
            .and_then(|v| v.to_str().ok())
    {
        let host = req
            .headers()
            .get(header::HOST)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let origin_host = origin.split("://").nth(1).unwrap_or(origin);
        if !origin_host.eq_ignore_ascii_case(host) {
            return Error::new(
                Kind::Unauthorized,
                format!("cross-origin request from {origin} refused"),
                "call this endpoint from the dashboard itself, or from a script without an Origin header",
            )
            .into_response()
            .with_status(StatusCode::FORBIDDEN);
        }
    }
    next.run(req).await
}
