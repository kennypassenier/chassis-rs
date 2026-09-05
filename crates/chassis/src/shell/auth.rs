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

use std::sync::Arc;

use axum::body::Body;
use axum::extract::{ConnectInfo, FromRequestParts, Request, State};
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Redirect, Response};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;

use crate::core::crypto::{Key, ct_eq};
use crate::core::error::{Error, Kind};
use crate::shell::guards::{Guards, IpLimit, client_ip, is_https};
use crate::shell::store::{Clients, SessionStore};
use crate::shell::time::{now_epoch, now_rfc3339, random_hex};

/// The two secrets, parsed. Built by `App` from the knobs.
#[derive(Clone)]
pub struct Secrets {
    pub login_token: SecretString,
    pub key: Key,
}

impl std::fmt::Debug for Secrets {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Secrets(***)")
    }
}

impl Secrets {
    /// Both or neither: a dashboard never starts half-locked (W6 = Don't do).
    pub fn parse(
        prefix: &str,
        token: Option<&str>,
        key_hex: Option<&str>,
    ) -> Result<Option<Secrets>, Error> {
        let token_env = format!("{prefix}_TOKEN");
        let key_env = format!("{prefix}_SECRET_KEY");
        match (token, key_hex) {
            (None, None) => Ok(None),
            (Some(_), None) | (None, Some(_)) => {
                let (set, missing) = if token.is_some() {
                    (token_env.clone(), key_env.clone())
                } else {
                    (key_env.clone(), token_env.clone())
                };
                Err(Error::config(
                    format!("{set} is set but {missing} is not; the dashboard needs both"),
                    format!(
                        "run `<binary> gen-secret` on a terminal to get a value for {missing}, then set it in the environment file"
                    ),
                ))
            }
            (Some(t), Some(k)) => {
                if t.len() < 16 {
                    return Err(Error::config(
                        format!("{token_env} is shorter than 16 characters"),
                        "use a long random value; `<binary> gen-secret` prints one",
                    ));
                }
                let candidate = random_hex(32)?;
                let key = Key::parse_hex(&key_env, k, &candidate)?;
                Ok(Some(Secrets {
                    login_token: SecretString::from(t.to_string()),
                    key,
                }))
            }
        }
    }
}

/// Everything the auth middlewares and handlers share.
#[derive(Clone)]
pub struct AuthState {
    pub name: &'static str,
    pub secrets: Secrets,
    pub clients: Clients,
    pub sessions: Arc<SessionStore>,
    pub session_ttl_secs: u64,
    pub remember_me_secs: u64,
    pub guards: Guards,
}

impl AuthState {
    pub fn cookie_name(&self) -> String {
        format!("{}_session", self.name.replace('-', "_"))
    }
}

/// Who a handler is talking to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Caller {
    /// Logged in with the bootstrap token (session or bearer).
    Admin,
    /// A registered client, by id and name.
    Client { id: String, name: String },
}

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

fn bearer(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| t.trim().to_string())
}

/// Resolve the caller from a bearer token or a session cookie; `None`
/// when neither is valid. Touches the client's usage in memory.
pub async fn identify(state: &AuthState, headers: &HeaderMap) -> Option<Caller> {
    if let Some(token) = bearer(headers) {
        if ct_eq(
            token.as_bytes(),
            state.secrets.login_token.expose_secret().as_bytes(),
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

/// Middleware for API routes: any authenticated caller passes and is
/// attached as `Caller`; otherwise a JSON 401.
pub async fn require_caller(
    State(state): State<AuthState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    match identify(&state, req.headers()).await {
        Some(caller) => {
            req.extensions_mut().insert(caller);
            next.run(req).await
        }
        None => Error::new(
            Kind::Unauthorized,
            "missing or invalid credentials",
            "send Authorization: Bearer <client token>, or log in on /login",
        )
        .into_response(),
    }
}

/// Middleware for dashboard routes: only Admin passes; a browser without
/// a session is redirected to `/login` instead of getting a JSON 401.
pub async fn require_admin(
    State(state): State<AuthState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    match identify(&state, req.headers()).await {
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
    if !ct_eq(
        form.token.as_bytes(),
        state.secrets.login_token.expose_secret().as_bytes(),
    ) {
        tracing::warn!(from = %client_ip(peer, headers, &state.guards.trusted_proxies), "login refused");
        return Ok(LoginOutcome::Wrong(
            "That token is not right. Check the service's login token and try again.",
        ));
    }
    let remember = form.remember.is_some();
    let value = random_hex(32)?;
    let ttl = if remember {
        state.remember_me_secs
    } else {
        state.session_ttl_secs
    };
    {
        let mut sessions = state.sessions.state.write().await;
        sessions.prune(now_epoch());
        sessions.create(&value, now_epoch(), ttl, remember);
    }
    state.sessions.save().await?;
    let mut cookie = Cookie::new(state.cookie_name(), value);
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_path("/");
    cookie.set_secure(is_https(peer, headers, &state.guards.trusted_proxies));
    if remember {
        cookie.set_max_age(time_duration(state.remember_me_secs));
    }
    Ok(LoginOutcome::Ok(cookie))
}

fn time_duration(secs: u64) -> time::Duration {
    time::Duration::seconds(secs as i64)
}

/// Remove the session server-side and expire the cookie.
pub async fn logout(state: &AuthState, headers: &HeaderMap) -> Result<Cookie<'static>, Error> {
    let jar = CookieJar::from_headers(headers);
    if let Some(cookie) = jar.get(&state.cookie_name()) {
        let removed = state.sessions.state.write().await.remove(cookie.value());
        if removed {
            state.sessions.save().await?;
        }
    }
    let mut gone = Cookie::new(state.cookie_name(), "");
    gone.set_path("/");
    gone.set_http_only(true);
    gone.set_max_age(time_duration(0));
    Ok(gone)
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

pub async fn logout_handler(State(state): State<AuthState>, headers: HeaderMap) -> Response {
    match logout(&state, &headers).await {
        Ok(cookie) => (CookieJar::new().add(cookie), Redirect::to("/login")).into_response(),
        Err(e) => e.into_response(),
    }
}

/// The IP-keyed limit for `/login` (K10), built from the knobs.
pub fn login_limit(guards: Guards, per_min: u32, burst: u32) -> Result<IpLimit, Error> {
    let limiter =
        crate::shell::guards::keyed_limiter(per_min, std::time::Duration::from_secs(60), burst)?;
    Ok(IpLimit { limiter, guards })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secrets_need_both_or_neither_and_point_at_gen_secret() {
        assert!(Secrets::parse("X", None, None).unwrap().is_none());
        let err = Secrets::parse("X", Some("a-long-enough-login-token"), None).unwrap_err();
        assert!(
            err.message
                .contains("X_TOKEN is set but X_SECRET_KEY is not")
        );
        assert!(err.remedy.contains("gen-secret"));
        let err = Secrets::parse("X", Some("short"), Some(&"ab".repeat(32))).unwrap_err();
        assert!(err.message.contains("16 characters"));
        let ok = Secrets::parse(
            "X",
            Some("a-long-enough-login-token"),
            Some(&"ab".repeat(32)),
        )
        .unwrap();
        assert!(ok.is_some());
        // A generated value never appears in the error text (critic #12).
        let err = Secrets::parse("X", Some("a-long-enough-login-token"), Some("zz")).unwrap_err();
        assert!(
            err.remedy.contains("e.g. "),
            "the remedy carries a pasteable candidate for a MALFORMED key"
        );
    }
}
