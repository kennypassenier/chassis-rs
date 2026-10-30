//! The login and logout mechanics: minting a session, building and
//! expiring the cookie. Its own module because it is the only code that
//! writes sessions; the parent keeps the public entry points and handlers.

use axum::http::HeaderMap;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use secrecy::ExposeSecret;

use super::{AuthState, LoginForm, LoginOutcome};
use crate::core::crypto::ct_eq;
use crate::core::error::Error;
use crate::shell::guards::{client_ip, is_https};
use crate::shell::time::{now_epoch, random_hex};

/// Body of [`super::login`].
pub(super) async fn login(
    state: &AuthState,
    form: &LoginForm,
    peer: std::net::SocketAddr,
    headers: &HeaderMap,
) -> Result<LoginOutcome, Error> {
    let Some(secrets) = &state.secrets else {
        return Err(Error::invalid(
            "this dashboard is open; there is no token to log in with",
            "set the service's _TOKEN and _SECRET_KEY to close it, then log in",
        ));
    };
    if !ct_eq(
        form.token.as_bytes(),
        secrets.login_token.expose_secret().as_bytes(),
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

/// Body of [`super::logout`].
pub(super) async fn logout(
    state: &AuthState,
    headers: &HeaderMap,
    https: bool,
) -> Result<Cookie<'static>, Error> {
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
    // S8: same attributes as the session cookie, so the browser matches
    // and clears exactly that cookie.
    gone.set_same_site(SameSite::Lax);
    gone.set_secure(https);
    gone.set_max_age(time_duration(0));
    Ok(gone)
}

impl AuthState {
    pub fn cookie_name(&self) -> String {
        format!("{}_session", self.name.replace('-', "_"))
    }
}
