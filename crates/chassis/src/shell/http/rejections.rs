//! Extractor rejections in the kit's error shape.
//!
//! axum answers a failed `Query`, `Json`, `Form` or `Path` extraction with a
//! bare text line ("Failed to deserialize query string: missing field
//! `now`"). A script reading the API expects the kit's `{error, remedy}`
//! JSON everywhere (AR4).
//!
//! Why a layer and not a wrapper extractor: a wrapper only helps handlers
//! that adopt it; the rejections of every existing `Query<T>` in every
//! project would stay raw. The layer detects them reliably because axum's
//! rejection texts are fixed, start with a known sentence and carry one of
//! 400/415/422 with a `text/plain` body; a handler's own plain-text 400 does
//! not begin with those sentences and passes untouched. The cost: a change
//! of axum's wording would make a rejection pass through raw, which the
//! test pins on the current texts.

use axum::body::{Body, HttpBody};
use axum::extract::Request;
use axum::http::{StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::core::error::Error;

/// Bodies longer than this are not an extractor rejection.
const MAX_REJECTION_BYTES: usize = 2048;

/// (start of axum's text, what to do about it).
const KNOWN: &[(&str, &str)] = &[
    (
        "Failed to deserialize query string",
        "check the query string against the endpoint's parameters: names, types and required fields",
    ),
    (
        "Failed to deserialize form",
        "send the form fields the endpoint expects, as application/x-www-form-urlencoded",
    ),
    (
        "Form requests must have",
        "send the body as application/x-www-form-urlencoded with that Content-Type header",
    ),
    (
        "Expected request with `Content-Type: application/json`",
        "send the body as JSON with the header Content-Type: application/json",
    ),
    (
        "Failed to parse the request body as JSON",
        "send valid JSON that matches the endpoint's body",
    ),
    (
        "Failed to deserialize the JSON body",
        "send a JSON body with the fields and types the endpoint expects",
    ),
    (
        "Failed to buffer the request body",
        "send the whole body again; the connection ended or the body was too large",
    ),
    (
        "Invalid URL",
        "check the path segments of the URL against the endpoint's route",
    ),
    (
        "Cannot parse",
        "check the path segments of the URL against the endpoint's route",
    ),
    (
        "Wrong number of path arguments",
        "check the path of the URL against the endpoint's route",
    ),
];

/// Rewrite axum's plain-text extractor rejections to the kit's JSON error,
/// keeping the status and the original sentence as the `error`.
pub(crate) async fn json_rejections(req: Request, next: Next) -> Response {
    let res = next.run(req).await;
    let status = res.status();
    let rejected_status = matches!(
        status,
        StatusCode::BAD_REQUEST
            | StatusCode::UNSUPPORTED_MEDIA_TYPE
            | StatusCode::UNPROCESSABLE_ENTITY
    );
    let plain = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|ct| ct.starts_with("text/plain"));
    if !rejected_status || !plain {
        return res;
    }
    let (parts, body) = res.into_parts();
    // A rejection is one short line; a longer plain-text body is a handler's
    // own answer and goes through unread.
    if body
        .size_hint()
        .exact()
        .is_none_or(|n| n > MAX_REJECTION_BYTES as u64)
    {
        return Response::from_parts(parts, body);
    }
    let Ok(bytes) = axum::body::to_bytes(body, MAX_REJECTION_BYTES).await else {
        return (parts.status, parts.headers).into_response();
    };
    let text = String::from_utf8_lossy(&bytes).trim().to_string();
    let Some((_, remedy)) = KNOWN.iter().find(|(start, _)| text.starts_with(start)) else {
        return Response::from_parts(parts, Body::from(bytes));
    };
    let mut out = Error::invalid(text, *remedy).into_response();
    *out.status_mut() = status;
    for (name, value) in &parts.headers {
        // The plain-text framing no longer applies; everything else
        // (request id, cookies, policy headers) is kept.
        if name != header::CONTENT_TYPE && name != header::CONTENT_LENGTH {
            out.headers_mut().append(name, value.clone());
        }
    }
    out
}
