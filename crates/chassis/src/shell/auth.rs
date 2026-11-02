//! Who is calling (K8, K12, AR6): the two secrets, the login session, the
//! client token, and the `Caller` a handler sees.
//!
//! Two doors. A browser logs in with the bootstrap token once and holds a
//! session cookie; a script or another service sends `Authorization:
//! Bearer <client token>` on every call. Both compare in constant time.
//! The bootstrap token also works as a bearer for scripts run by Kenny.
//!
//! Two secrets, on purpose: `<P>_TOKEN` (login) may rotate freely;
//! `<P>_SECRET_KEY` encrypts the stores, and rotating it needs `rekey`.
//! Missing one while the other is set is a startup error whose remedy
//! points at `gen-secret` rather than printing a value into the journal
//! (critic #12).

mod admin_extractor;
mod caller;
mod cookie_origin;
mod door_hint;
#[cfg(test)]
mod door_tests;
mod limits;
mod lookup;
mod navigation;
mod secrets;
mod session;
#[cfg(test)]
mod tests;

use std::sync::Arc;

use axum::body::Body;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Redirect, Response};
use axum_extra::extract::cookie::{Cookie, CookieJar};
use secrecy::SecretString;
use serde::Deserialize;

use crate::core::crypto::Key;
use crate::core::error::{Error, Kind};
use crate::shell::guards::{Guards, IpLimit};
use crate::shell::store::{Clients, SessionStore};

pub use admin_extractor::RequireAdmin;
use caller::bearer;
pub(crate) use door_hint::DoorHint;
pub(crate) use lookup::{identify_request, still_valid_now};

/// The two secrets, parsed. Built by `App` from the knobs.
#[derive(Clone)]
pub struct Secrets {
    pub login_token: SecretString,
    pub key: Key,
}

/// Everything the auth middlewares and handlers share.
#[derive(Clone)]
pub struct AuthState {
    pub name: &'static str,
    /// `None` only for a service that opted in to an OPEN dashboard
    /// (`AppSpec::open_dashboard`) and runs without both secrets: every
    /// caller is then the admin and nothing is sealed.
    pub secrets: Option<Secrets>,
    pub clients: Clients,
    pub sessions: Arc<SessionStore>,
    pub session_ttl_secs: u64,
    pub remember_me_secs: u64,
    pub guards: Guards,
}

/// Who a handler is talking to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Caller {
    /// Logged in with the bootstrap token (session or bearer).
    Admin,
    /// A registered client, by id and name.
    Client { id: String, name: String },
}

/// Resolve the caller from a bearer token or a session cookie; `None`
/// when neither is valid. Touches the client's usage in memory.
pub async fn identify(state: &AuthState, headers: &HeaderMap) -> Option<Caller> {
    lookup::identify(state, headers).await
}

/// Whether the caller these headers identified is still allowed in, read
/// without touching anything: no session's expiry slides and no client's
/// last-used time moves. For checks that repeat by themselves (feat-live-1:
/// an open stream ends at logout, expiry or revocation).
pub async fn still_valid(state: &AuthState, headers: &HeaderMap) -> bool {
    lookup::still_valid(state, headers).await
}

/// Middleware for API routes: any authenticated caller passes and is
/// attached as `Caller`; otherwise a JSON 401. A call authenticated by the
/// session cookie (not a bearer) from another website is a JSON 403.
pub async fn require_caller(
    State(state): State<AuthState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let trusted = crate::shell::trusted::is_trusted(req.extensions());
    match identify_request(&state, trusted, req.headers()).await {
        Some(caller) => {
            if let Some(refusal) = cookie_origin::refuse_cross_site(&state, req.headers()) {
                return refusal;
            }
            req.extensions_mut().insert(caller);
            next.run(req).await
        }
        None => Error::new(
            Kind::Unauthorized,
            "missing or invalid credentials",
            door_hint::remedy_for(req.extensions().get::<DoorHint>(), req.headers()),
        )
        .into_response(),
    }
}

/// Middleware for dashboard routes: only Admin passes; a browser navigation
/// without a session is redirected to `/login`, a script call (`fetch`: see
/// `navigation`) gets a 401 JSON with the remedy.
pub async fn require_admin(
    State(state): State<AuthState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let trusted = crate::shell::trusted::is_trusted(req.extensions());
    match identify_request(&state, trusted, req.headers()).await {
        Some(Caller::Admin) => {
            req.extensions_mut().insert(Caller::Admin);
            next.run(req).await
        }
        Some(Caller::Client { .. }) => Error::new(
            Kind::Unauthorized,
            "a client token cannot open the dashboard",
            "log in on /login with the service's login token",
        )
        .into_response(),
        // K30: a caller that SENT a bearer is a script, not a browser; a
        // login page is no answer for it, a 401 with the remedy is.
        None if bearer(req.headers()).is_some() => {
            let prefix = state.name.to_ascii_uppercase().replace('-', "_");
            Error::new(
                Kind::Unauthorized,
                format!("the bearer token is not this service's {prefix}_TOKEN"),
                format!(
                    "send the value of {prefix}_TOKEN from the service's environment file (`chassis clients` reads it from the variable named by --token-env); a client token cannot manage clients"
                ),
            )
            .into_response()
        }
        // A script call (fetch, XHR) must not follow a redirect into a 200
        // login page; a navigation still lands on the form.
        None if navigation::is_script_call(req.headers()) => Error::new(
            Kind::Unauthorized,
            "not logged in",
            "log in on /login, then repeat the call",
        )
        .into_response(),
        None => Redirect::to("/login").into_response(),
    }
}

/// The login form's fields.
#[derive(Debug, Deserialize)]
pub struct LoginForm {
    pub token: String,
    #[serde(default)]
    pub remember: Option<String>,
}

/// What the login handler returns: the page decides how to render it
/// (L4 adds the template); the mechanism is here.
pub enum LoginOutcome {
    /// Set this cookie and go to `/`.
    Ok(Cookie<'static>),
    /// Wrong token: render the page again with the message, HTTP 200 so a
    /// browser never pops its own basic-auth dialog (K8).
    Wrong(&'static str),
}

/// Check the token, mint a session, build the cookie.
pub async fn login(
    state: &AuthState,
    form: &LoginForm,
    peer: std::net::SocketAddr,
    headers: &HeaderMap,
) -> Result<LoginOutcome, Error> {
    session::login(state, form, peer, headers).await
}

/// Remove the session server-side and expire the cookie.
pub async fn logout(
    state: &AuthState,
    headers: &HeaderMap,
    https: bool,
) -> Result<Cookie<'static>, Error> {
    session::logout(state, headers, https).await
}

/// JSON login handler (the HTML page wraps this in L4): POST form.
pub async fn login_handler(
    State(state): State<AuthState>,
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
    axum::Form(form): axum::Form<LoginForm>,
) -> Response {
    match login(&state, &form, peer, &headers).await {
        Ok(LoginOutcome::Ok(cookie)) => {
            let jar = CookieJar::new().add(cookie);
            (jar, Redirect::to("/")).into_response()
        }
        Ok(LoginOutcome::Wrong(msg)) => (StatusCode::OK, msg).into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn logout_handler(
    State(state): State<AuthState>,
    axum::extract::ConnectInfo(peer): axum::extract::ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
) -> Response {
    let https = crate::shell::guards::is_https(peer, &headers, &state.guards.trusted_proxies);
    match logout(&state, &headers, https).await {
        Ok(cookie) => (CookieJar::new().add(cookie), Redirect::to("/login")).into_response(),
        Err(e) => e.into_response(),
    }
}

/// The IP-keyed limit for `/login` (K10), built from the knobs.
pub fn login_limit(guards: Guards, per_min: u32, burst: u32) -> Result<IpLimit, Error> {
    limits::login_limit(guards, per_min, burst)
}

/// Middleware state for the per-client-token API limit (K10, H3).
#[derive(Clone)]
pub struct TokenLimit {
    pub limiter: std::sync::Arc<crate::shell::guards::KeyedLimiter<String>>,
    pub guards: Guards,
}

/// `per_sec` requests per second per client token, bursts of `burst`.
pub fn token_limit(guards: Guards, per_sec: u32, burst: u32) -> Result<TokenLimit, Error> {
    limits::token_limit(guards, per_sec, burst)
}

/// Rate-limit API calls per client (after `require_caller` identified it);
/// the admin's own token is not limited. Over the limit → 429 + Retry-After.
pub async fn token_rate_limit(
    State(l): State<TokenLimit>,
    req: Request<Body>,
    next: Next,
) -> Response {
    limits::token_rate_limit(State(l), req, next).await
}
