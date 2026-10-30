//! Request/response hygiene middleware: security headers, the JSON 413 and
//! the request-id sanitiser. Its own module because each is a small,
//! stateless filter with no tie to the layer stack.

use axum::extract::Request;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::core::error::Error;

/// Body of [`super::security_headers`].
pub(super) async fn security_headers(req: Request, next: Next) -> Response {
    let mut res = next.run(req).await;
    let h = res.headers_mut();
    let put = |h: &mut axum::http::HeaderMap, k: &'static str, v: &'static str| {
        h.entry(k)
            .or_insert(axum::http::HeaderValue::from_static(v));
    };
    put(
        h,
        "content-security-policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    put(h, "x-content-type-options", "nosniff");
    put(h, "x-frame-options", "DENY");
    // CF-7 (2026-09-06): `same-origin`, not `no-referrer`. Under
    // `no-referrer` a browser sends `Origin: null` on every form submit (a
    // navigation, per the Fetch standard) and the CSRF rule refused every
    // dashboard form — login included — from Chrome. `same-origin` keeps
    // the referrer inside this host and still blanks it towards others.
    put(h, "referrer-policy", "same-origin");
    res
}

/// Body of [`super::json_413`].
pub(super) async fn json_413(req: Request, next: Next) -> Response {
    let res = next.run(req).await;
    if res.status() != axum::http::StatusCode::PAYLOAD_TOO_LARGE {
        return res;
    }
    let is_json = res
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|ct| ct.starts_with("application/json"));
    if is_json {
        return res;
    }
    let mut out = Error::invalid(
        "the request body is larger than this service accepts",
        "send a body within max_body_bytes (the knob <PREFIX>_MAX_BODY_BYTES sets it)",
    )
    .into_response();
    *out.status_mut() = axum::http::StatusCode::PAYLOAD_TOO_LARGE;
    out
}
