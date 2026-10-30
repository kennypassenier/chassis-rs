//! Passkey login: the start and finish halves of the ceremony, ending in
//! the same session cookie the token login mints.

use std::net::SocketAddr;

use axum::Json;
use axum::extract::{ConnectInfo, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Redirect, Response};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use webauthn_rs::prelude::*;

use super::{LoginFinish, PasskeyState, Pending, StartResponse, webauthn_error};
use crate::core::error::{Error, Kind};
use crate::shell::guards::is_https;
use crate::shell::time::{now_epoch, now_rfc3339, random_hex};

/// Body of [`super::login_start`].
pub(super) async fn start(
    State(s): State<PasskeyState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<StartResponse<RequestChallengeResponse>>, Error> {
    let creds: Vec<Passkey> = s
        .store
        .lock()
        .expect("passkeys lock")
        .passkeys
        .iter()
        .map(|p| p.passkey.clone())
        .collect();
    if creds.is_empty() {
        return Err(Error::new(
            Kind::NotFound,
            "no passkeys are registered yet",
            "log in with the token first and register one on the Passkeys page",
        ));
    }
    let (options, auth) = s
        .webauthn
        .start_passkey_authentication(&creds)
        .map_err(webauthn_error)?;
    let ceremony = s.put_pending(peer, &headers, Pending::Login(auth))?;
    Ok(Json(StartResponse { ceremony, options }))
}

/// Body of [`super::login_finish`].
pub(super) async fn finish(
    State(s): State<PasskeyState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<LoginFinish>,
) -> Result<Response, Error> {
    let Some(Pending::Login(auth)) = s.take_pending(&body.ceremony) else {
        return Err(Error::invalid(
            "no login ceremony with that id (expired or already used)",
            "press the passkey button again",
        ));
    };
    let result = s
        .webauthn
        .finish_passkey_authentication(&body.credential, &auth)
        .map_err(webauthn_error)?;
    let mut used_id = None;
    {
        let mut store = s.store.lock().expect("passkeys lock");
        for p in store.passkeys.iter_mut() {
            if p.passkey.cred_id() == result.cred_id() {
                p.passkey.update_credential(&result);
                p.last_used_at = Some(now_rfc3339());
                used_id = Some(p.id.clone());
            }
        }
    }
    s.save()?;
    let value = random_hex(32)?;
    {
        let mut sessions = s.auth.sessions.state.write().await;
        sessions.prune(now_epoch());
        sessions.create(&value, now_epoch(), s.auth.session_ttl_secs, false);
    }
    s.auth.sessions.save().await?;
    if let Some(id) = &used_id {
        s.remember_login(&value, id);
    }
    let mut cookie = Cookie::new(s.auth.cookie_name(), value);
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_path("/");
    cookie.set_secure(is_https(peer, &headers, &s.auth.guards.trusted_proxies));
    tracing::info!("passkey login");
    Ok((CookieJar::new().add(cookie), Redirect::to("/")).into_response())
}
