//! API calls authenticated by ambient credentials must come from this site.
//!
//! The session cookie is `Lax`, so a browser attaches it to a top-level GET
//! navigation from any other website, and the CSRF rule lets every GET
//! through. An API route that acts on GET (kyu's `GET /t/{topic}/next`
//! consumes a message) could then be triggered by a link on another site.
//! A bearer token is never attached by a browser on its own, so only calls
//! that arrive WITHOUT a bearer are checked: the session cookie, and the
//! trusted-sources mark, which is ambient in the same way.

use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};

use super::AuthState;
use super::caller::bearer;
use crate::core::error::{Error, Kind};
use crate::shell::guards::cross_site;

/// The 403 for a cookie-authenticated cross-site call, or `None` when the
/// call may pass (bearer, same-site, open dashboard, no browser metadata).
pub(super) fn refuse_cross_site(state: &AuthState, headers: &HeaderMap) -> Option<Response> {
    // An open dashboard has no cookie: nothing ambient to protect.
    state.secrets.as_ref()?;
    if bearer(headers).is_some() {
        return None;
    }
    let why = cross_site(headers)?;
    let mut res = Error::new(
        Kind::Unauthorized,
        format!("cross-site call authenticated by the session cookie refused ({why})"),
        "call the API from this site's own pages, or send Authorization: Bearer <client token>",
    )
    .into_response();
    *res.status_mut() = axum::http::StatusCode::FORBIDDEN;
    Some(res)
}
