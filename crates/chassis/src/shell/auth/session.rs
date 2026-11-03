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
    let https = is_https(peer, headers, &state.guards.trusted_proxies);
    let mut cookie = Cookie::new(state.session_cookie_name(https), value);
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_path("/");
    cookie.set_secure(https);
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
    // Both names end: a session opened before the `__Host-` name (host-cookie,
    // 4.6.0) must not stay usable after a logout over https.
    let mut removed = false;
    for name in [state.cookie_name(), state.host_cookie_name()] {
        if let Some(cookie) = jar.get(&name) {
            removed |= state.sessions.state.write().await.remove(cookie.value());
        }
    }
    if removed {
        state.sessions.save().await?;
    }
    let mut gone = Cookie::new(state.session_cookie_name(https), "");
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
    /// The session cookie's plain name, as used over http (`<name>_session`).
    pub fn cookie_name(&self) -> String {
        format!("{}_session", self.name.replace('-', "_"))
    }

    /// The name over https (Kenny's host-cookie, 4.6.0): the `__Host-`
    /// prefix makes the browser refuse it unless it is Secure, Path=/ and
    /// without a Domain, so no other service under the same domain can set
    /// or shadow it. Over plain http a browser cannot keep such a cookie, so
    /// http keeps the plain name.
    pub fn host_cookie_name(&self) -> String {
        format!("__Host-{}", self.cookie_name())
    }

    /// The name a new session cookie gets.
    pub fn session_cookie_name(&self, https: bool) -> String {
        if https {
            self.host_cookie_name()
        } else {
            self.cookie_name()
        }
    }

    /// The session cookie a request carries: the `__Host-` one first, else
    /// the plain one (http, or a session opened before 4.6.0).
    pub fn session_cookie<'a>(&self, jar: &'a CookieJar) -> Option<&'a Cookie<'static>> {
        jar.get(&self.host_cookie_name())
            .or_else(|| jar.get(&self.cookie_name()))
    }
}
