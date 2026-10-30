//! Passkey registration: the start and finish halves of the ceremony.

use std::net::SocketAddr;

use axum::Json;
use axum::extract::{ConnectInfo, State};
use axum::http::HeaderMap;
use webauthn_rs::prelude::*;

use super::{
    PasskeyState, PasskeyView, Pending, RegisterFinish, StartResponse, StoredPasskey,
    webauthn_error,
};
use crate::core::error::Error;
use crate::shell::time::{now_rfc3339, random_hex};

/// Body of [`super::register_start`].
pub(super) async fn start(
    State(s): State<PasskeyState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<StartResponse<CreationChallengeResponse>>, Error> {
    let exclude: Vec<CredentialID> = s
        .store
        .lock()
        .expect("passkeys lock")
        .passkeys
        .iter()
        .map(|p| p.passkey.cred_id().clone())
        .collect();
    let user_id = Uuid::new_v4();
    let (options, reg) = s
        .webauthn
        .start_passkey_registration(
            user_id,
            "admin",
            &format!("{} admin", s.auth.name),
            Some(exclude),
        )
        .map_err(webauthn_error)?;
    let ceremony = s.put_pending(peer, &headers, Pending::Register(reg))?;
    Ok(Json(StartResponse { ceremony, options }))
}

/// Body of [`super::register_finish`].
pub(super) async fn finish(
    State(s): State<PasskeyState>,
    Json(body): Json<RegisterFinish>,
) -> Result<Json<PasskeyView>, Error> {
    let Some(Pending::Register(reg)) = s.take_pending(&body.ceremony) else {
        return Err(Error::invalid(
            "no registration ceremony with that id (expired or already used)",
            "start again from the Passkeys page",
        ));
    };
    let passkey = s
        .webauthn
        .finish_passkey_registration(&body.credential, &reg)
        .map_err(webauthn_error)?;
    let label = if body.label.trim().is_empty() {
        "passkey".to_string()
    } else {
        body.label.trim().chars().take(64).collect()
    };
    let stored = StoredPasskey {
        id: random_hex(8)?,
        label,
        created_at: now_rfc3339(),
        last_used_at: None,
        passkey,
    };
    let view = PasskeyView {
        id: stored.id.clone(),
        label: stored.label.clone(),
        created_at: stored.created_at.clone(),
        last_used_at: None,
    };
    s.store.lock().expect("passkeys lock").passkeys.push(stored);
    s.save()?;
    tracing::info!(passkey = %view.label, "passkey registered");
    Ok(Json(view))
}
