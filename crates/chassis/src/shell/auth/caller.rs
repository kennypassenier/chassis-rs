//! The `Caller` extractor and the bearer-header reader. Its own module so
//! "how a handler obtains its caller" is separate from how a caller is
//! identified.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{HeaderMap, header};
use axum::response::{IntoResponse, Response};

use super::Caller;
use crate::core::error::{Error, Kind};

impl<S: Send + Sync> FromRequestParts<S> for Caller {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        parts.extensions.get::<Caller>().cloned().ok_or_else(|| {
            Error::new(
                Kind::Unauthorized,
                "this route requires authentication",
                "log in on /login, or send Authorization: Bearer <token>",
            )
            .into_response()
        })
    }
}

/// The token of an `Authorization: Bearer <token>` header, if one is sent.
pub(super) fn bearer(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| t.trim().to_string())
}
