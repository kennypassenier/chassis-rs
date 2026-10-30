//! Resolving a request to a caller: bearer token or session cookie, with
//! and without touching state. Its own module because these are the
//! credential checks every middleware shares; the middlewares in the parent
//! only decide what to do with the answer. The public entry points in the
//! parent delegate here.

use axum::http::HeaderMap;
use axum_extra::extract::cookie::CookieJar;
use secrecy::ExposeSecret;

use super::caller::bearer;
use super::{AuthState, Caller};
use crate::core::crypto::ct_eq;
use crate::shell::time::{now_epoch, now_rfc3339};

/// Body of [`super::identify`].
pub(super) async fn identify(state: &AuthState, headers: &HeaderMap) -> Option<Caller> {
    // An open dashboard has no door: whoever reached the port is the admin.
    let Some(secrets) = &state.secrets else {
        return Some(Caller::Admin);
    };
    if let Some(token) = bearer(headers) {
        if ct_eq(
            token.as_bytes(),
            secrets.login_token.expose_secret().as_bytes(),
        ) {
            return Some(Caller::Admin);
        }
        let snapshot = state.clients.snapshot();
        if let Some(c) = snapshot.by_token(&token) {
            state.clients.touch(&c.id, &now_rfc3339());
            return Some(Caller::Client {
                id: c.id.clone(),
                name: c.name.clone(),
            });
        }
        return None;
    }
    let jar = CookieJar::from_headers(headers);
    if let Some(cookie) = jar.get(&state.cookie_name()) {
        let mut sessions = state.sessions.state.write().await;
        if sessions.touch(cookie.value(), now_epoch(), state.session_ttl_secs) {
            return Some(Caller::Admin);
        }
    }
    None
}

/// Body of [`super::still_valid`].
pub(super) async fn still_valid(state: &AuthState, headers: &HeaderMap) -> bool {
    let Some(secrets) = &state.secrets else {
        return true;
    };
    if let Some(token) = bearer(headers) {
        return ct_eq(
            token.as_bytes(),
            secrets.login_token.expose_secret().as_bytes(),
        ) || state.clients.snapshot().by_token(&token).is_some();
    }
    let jar = CookieJar::from_headers(headers);
    match jar.get(&state.cookie_name()) {
        Some(cookie) => state
            .sessions
            .state
            .read()
            .await
            .is_live(cookie.value(), now_epoch()),
        None => false,
    }
}

/// [`still_valid`] for a caller that cannot wait (the error page is rendered
/// by a plain function): the session store's lock is tried, not awaited. A
/// store that is busy answers `false`, which draws the page without the
/// navigation; the next page load is right again.
pub(crate) fn still_valid_now(state: &AuthState, headers: &HeaderMap) -> bool {
    let Some(secrets) = &state.secrets else {
        return true;
    };
    if let Some(token) = bearer(headers) {
        return ct_eq(
            token.as_bytes(),
            secrets.login_token.expose_secret().as_bytes(),
        );
    }
    let jar = CookieJar::from_headers(headers);
    match (
        jar.get(&state.cookie_name()),
        state.sessions.state.try_read(),
    ) {
        (Some(cookie), Ok(sessions)) => sessions.is_live(cookie.value(), now_epoch()),
        _ => false,
    }
}

/// [`identify`] for a whole request: a request the trusted-sources layer
/// marked is the admin when it sends no bearer (a bearer still decides, so a
/// script on that machine keeps its own identity).
pub(crate) async fn identify_request(
    state: &AuthState,
    trusted: bool,
    headers: &HeaderMap,
) -> Option<Caller> {
    if trusted && bearer(headers).is_none() {
        return Some(Caller::Admin);
    }
    identify(state, headers).await
}
