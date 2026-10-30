//! The HTTPS-only gate in front of the passkey routes (K9).

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::PasskeyState;
use crate::core::error::{Error, Kind};
use crate::shell::guards::is_https;

/// Body of [`super::require_https`].
pub(super) async fn run(
    State(s): State<PasskeyState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    req: Request,
    next: Next,
) -> Response {
    if is_https(peer, req.headers(), &s.auth.guards.trusted_proxies) {
        next.run(req).await
    } else {
        Error::new(
            Kind::NotFound,
            "passkeys are only offered over HTTPS",
            "open the dashboard through the TLS proxy named in PUBLIC_URL, and list that proxy in TRUSTED_PROXIES",
        )
        .into_response()
    }
}
