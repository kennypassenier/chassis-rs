//! Passkeys (K9, AR6): WebAuthn registration and login for the dashboard,
//! offered only over HTTPS behind a trusted proxy.
//!
//! The browser side needs a secure context, so every route here answers
//! 404 unless the request arrived over HTTPS as judged by `is_https`
//! (a trusted proxy's `X-Forwarded-Proto`). Registering the first passkey
//! requires a token login; afterwards a passkey alone opens the same admin
//! session the token would. Credentials live in `passkeys.json.enc` under
//! the state root, sealed like the other stores. Ceremony state (the
//! challenge between start and finish) lives in a bounded in-memory map
//! with a TTL, so a registration must finish against the same instance —
//! a single-process service, which is what these are.
//!
//! Relying-party id and origin come from `<P>_PUBLIC_URL` (critic #5):
//! deriving them from the `Host` header would let a client choose them.

mod ceremonies;
mod https_gate;
mod login;
mod manage;
mod register;
mod relying_party;
mod state_open;
mod state_ops;

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{ConnectInfo, Path, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use serde::{Deserialize, Serialize};
use webauthn_rs::prelude::*;

use crate::core::error::{Error, Kind};
use crate::shell::auth::AuthState;
use crate::shell::store::EncryptedFile;

pub const PASSKEYS_FORMAT: u32 = 1;

/// How long a started ceremony may wait for its finish.
/// Default of `passkey_ceremony_ttl_secs`; the live value is a knob (S6).
pub const CEREMONY_TTL: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredPasskey {
    pub id: String,
    pub label: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
    pub passkey: Passkey,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasskeysFile {
    pub v: u32,
    pub passkeys: Vec<StoredPasskey>,
}

impl Default for PasskeysFile {
    fn default() -> Self {
        Self {
            v: PASSKEYS_FORMAT,
            passkeys: Vec::new(),
        }
    }
}

enum Pending {
    Register(PasskeyRegistration),
    Login(PasskeyAuthentication),
}

/// The three bounds on pending ceremonies (S6, knobs `passkey_ceremony_cap`,
/// `passkey_ceremony_ttl_secs`, `passkey_ceremonies_per_ip`).
#[derive(Debug, Clone, Copy)]
pub struct CeremonyLimits {
    pub cap: usize,
    pub ttl: Duration,
    pub per_ip: usize,
}

/// Pending ceremonies, bounded three ways (S6): a TTL, a global cap and a
/// per-IP cap. "Full" never means "refuse" — the oldest ceremony makes
/// room — so an unauthenticated peer can evict its OWN ceremonies at will
/// and nobody else's beyond the per-IP share, while the IP limiter on the
/// login routes bounds how fast it can even do that. Until 1.4.0 the table
/// simply refused at 64, which let one machine block passkey login and
/// registration for everyone for five minutes.
pub struct Ceremonies<P> {
    map: HashMap<String, (Instant, IpAddr, P)>,
    limits: CeremonyLimits,
}

/// Router state for the passkey routes.
#[derive(Clone)]
pub struct PasskeyState {
    pub webauthn: Arc<Webauthn>,
    pub auth: AuthState,
    file: Option<EncryptedFile>,
    /// 3.11.0: the kit database, when the passkeys live there.
    #[cfg(feature = "dashboard")]
    kit: Option<crate::storage::KitDb>,
    store: Arc<Mutex<PasskeysFile>>,
    pending: Arc<Mutex<Ceremonies<Pending>>>,
    /// For the client IP behind a trusted proxy (the per-IP share).
    guards: crate::shell::guards::Guards,
    /// Session (SHA-256 of its cookie) to the stored passkey that opened it.
    logins: Arc<Mutex<HashMap<String, (u64, String)>>>,
}

/// How many passkey logins `PasskeyState` remembers for `current`.
const LOGINS_CAP: usize = 256;

/// Parse `<P>_PUBLIC_URL` into the relying party.
pub fn build_webauthn(
    app_name: &str,
    prefix: &str,
    public_url: Option<&str>,
) -> Result<Webauthn, Error> {
    relying_party::build(app_name, prefix, public_url)
}

/// Middleware: passkey routes exist only over HTTPS (K9).
pub async fn require_https(
    State(s): State<PasskeyState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    req: Request,
    next: Next,
) -> Response {
    https_gate::run(State(s), ConnectInfo(peer), req, next).await
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PasskeyView {
    pub id: String,
    pub label: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

/// A passkey as the admin API lists it: the [`PasskeyView`] fields plus
/// `current`, true for the passkey the asking session logged in with.
#[derive(Debug, Serialize, Deserialize)]
#[non_exhaustive]
pub struct PasskeyListing {
    #[serde(flatten)]
    pub view: PasskeyView,
    #[serde(default)]
    pub current: bool,
}

#[derive(Serialize)]
pub struct StartResponse<T: Serialize> {
    pub ceremony: String,
    pub options: T,
}

/// `POST /passkeys/register/start` (admin): a challenge for a new passkey.
pub async fn register_start(
    State(s): State<PasskeyState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<StartResponse<CreationChallengeResponse>>, Error> {
    register::start(State(s), ConnectInfo(peer), headers).await
}

#[derive(Deserialize)]
pub struct RegisterFinish {
    pub ceremony: String,
    pub label: String,
    pub credential: RegisterPublicKeyCredential,
}

/// `POST /passkeys/register/finish` (admin): store the new passkey.
pub async fn register_finish(
    State(s): State<PasskeyState>,
    Json(body): Json<RegisterFinish>,
) -> Result<Json<PasskeyView>, Error> {
    register::finish(State(s), Json(body)).await
}

/// `POST /passkeys/login/start` (public over HTTPS): a challenge against
/// every stored passkey.
pub async fn login_start(
    State(s): State<PasskeyState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<StartResponse<RequestChallengeResponse>>, Error> {
    login::start(State(s), ConnectInfo(peer), headers).await
}

#[derive(Deserialize)]
pub struct LoginFinish {
    pub ceremony: String,
    pub credential: PublicKeyCredential,
}

/// `POST /passkeys/login/finish` (public over HTTPS): verify and open an
/// admin session, exactly as the token login would.
pub async fn login_finish(
    State(s): State<PasskeyState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<LoginFinish>,
) -> Result<Response, Error> {
    login::finish(State(s), ConnectInfo(peer), headers, Json(body)).await
}

/// `GET /api/passkeys` (admin).
pub async fn list(State(s): State<PasskeyState>) -> Json<Vec<PasskeyView>> {
    Json(s.list())
}

/// `GET /api/passkeys` as the router serves it: like [`list`], with
/// `current` set for the caller's session.
pub async fn list_current(
    State(s): State<PasskeyState>,
    headers: HeaderMap,
) -> Json<Vec<PasskeyListing>> {
    Json(s.list_for_request(&headers).await)
}

/// Longest passkey name `rename` accepts, in characters (as at registration).
pub const MAX_NAME_CHARS: usize = 64;

#[derive(Deserialize)]
#[non_exhaustive]
pub struct RenameBody {
    pub name: String,
}

/// Trim a passkey name and check it is 1 to 64 characters.
pub fn clean_name(raw: &str) -> Result<String, Error> {
    manage::clean_name(raw)
}

/// `PATCH /api/passkeys/{id}` and `PATCH /api/kit/passkeys/{id}` (admin):
/// rename a passkey. Body `{ "name": "…" }`; answers the updated view.
pub async fn rename(
    State(s): State<PasskeyState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<RenameBody>,
) -> Result<Json<PasskeyListing>, Error> {
    manage::rename(State(s), headers, Path(id), Json(body)).await
}

/// `DELETE /api/passkeys/{id}` (admin).
pub async fn delete(
    State(s): State<PasskeyState>,
    Path(id): Path<String>,
) -> Result<StatusCode, Error> {
    manage::delete(State(s), Path(id)).await
}

fn webauthn_error(e: WebauthnError) -> Error {
    Error::new(
        Kind::Invalid,
        format!("passkey ceremony failed: {e}"),
        "try again; if it keeps failing, the browser may not support this authenticator or PUBLIC_URL does not match the address bar",
    )
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod ceremony_tests;
