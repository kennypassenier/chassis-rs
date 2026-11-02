//! `RequireAdmin`: the extractor for an API handler only the admin may call.
//!
//! `api_routes` admit any registered client, so a handler that changes
//! something clients must not (kyu's topic administration) says so in its
//! signature instead of matching on [`Caller`] by hand.

use axum::extract::FromRequestParts;
use axum::http::StatusCode;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};

use super::Caller;
use crate::core::error::{Error, Kind};

/// Succeeds only for [`Caller::Admin`]; a client token gets a 403 JSON
/// `{error, remedy}`, a request with no caller at all the same 401 as `Caller`.
///
/// ```text
/// async fn purge(RequireAdmin: RequireAdmin) -> &'static str { "purged" }
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RequireAdmin;

impl<S: Send + Sync> FromRequestParts<S> for RequireAdmin {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        match Caller::from_request_parts(parts, state).await? {
            Caller::Admin => Ok(RequireAdmin),
            Caller::Client { name, .. } => {
                let mut res = Error::new(
                    Kind::Unauthorized,
                    format!("client `{name}` may not call this route; it is for the admin"),
                    "call it with the service's login token, or from a logged-in dashboard session",
                )
                .into_response();
                *res.status_mut() = StatusCode::FORBIDDEN;
                Err(res)
            }
        }
    }
}
