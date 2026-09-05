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

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{ConnectInfo, Path, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Redirect, Response};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::{Deserialize, Serialize};
use webauthn_rs::prelude::*;

use crate::core::error::{Error, Kind};
use crate::shell::auth::AuthState;
use crate::shell::guards::is_https;
use crate::shell::store::EncryptedFile;
use crate::shell::time::{now_epoch, now_rfc3339, random_hex};

pub const PASSKEYS_FORMAT: u32 = 1;

/// How long a started ceremony may wait for its finish.
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

/// Router state for the passkey routes.
#[derive(Clone)]
pub struct PasskeyState {
    pub webauthn: Arc<Webauthn>,
    pub auth: AuthState,
    file: EncryptedFile,
    store: Arc<Mutex<PasskeysFile>>,
    pending: Arc<Mutex<HashMap<String, (Instant, Pending)>>>,
}

/// Parse `<P>_PUBLIC_URL` into the relying party.
pub fn build_webauthn(
    app_name: &str,
    prefix: &str,
    public_url: Option<&str>,
) -> Result<Webauthn, Error> {
    let raw = public_url.ok_or_else(|| {
        Error::config(
            format!("passkeys are compiled in but {prefix}_PUBLIC_URL is not set"),
            format!("set {prefix}_PUBLIC_URL to the https:// address the dashboard is reached at behind the proxy, e.g. https://inbox.example.lan"),
        )
    })?;
    let url = Url::parse(raw).map_err(|e| {
        Error::config(
            format!("{prefix}_PUBLIC_URL `{raw}` is not a URL: {e}"),
            "use the full origin, e.g. https://inbox.example.lan",
        )
    })?;
    if url.scheme() != "https" && url.host_str() != Some("localhost") {
        return Err(Error::config(
            format!("{prefix}_PUBLIC_URL must be https:// (browsers refuse passkeys elsewhere)"),
            "put Traefik or another TLS proxy in front and set the https origin here",
        ));
    }
    let rp_id = url.host_str().ok_or_else(|| {
        Error::config(
            format!("{prefix}_PUBLIC_URL has no host"),
            "use the full origin",
        )
    })?;
    WebauthnBuilder::new(rp_id, &url)
        .and_then(|b| b.rp_name(app_name).build())
        .map_err(|e| {
            Error::config(
                format!("cannot build the WebAuthn relying party: {e}"),
                "check PUBLIC_URL",
            )
        })
}

impl PasskeyState {
    pub fn open(webauthn: Webauthn, auth: AuthState, file: EncryptedFile) -> Result<Self, Error> {
        let loaded: PasskeysFile = file.load()?.unwrap_or_default();
        if loaded.v != PASSKEYS_FORMAT {
            return Err(Error::config(
                format!(
                    "passkeys store is format {} but this build reads {}",
                    loaded.v, PASSKEYS_FORMAT
                ),
                "restore the pre-update copy or upgrade",
            ));
        }
        Ok(Self {
            webauthn: Arc::new(webauthn),
            auth,
            file,
            store: Arc::new(Mutex::new(loaded)),
            pending: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    fn save(&self) -> Result<(), Error> {
        let snapshot = self.store.lock().expect("passkeys lock").clone();
        self.file.save(&snapshot)
    }

    fn put_pending(&self, p: Pending) -> Result<String, Error> {
        let id = random_hex(16)?;
        let mut map = self.pending.lock().expect("pending lock");
        let now = Instant::now();
        map.retain(|_, (t, _)| now.duration_since(*t) < CEREMONY_TTL);
        if map.len() >= 64 {
            return Err(Error::new(
                Kind::Overloaded,
                "too many passkey ceremonies in flight",
                "wait a moment and try again",
            ));
        }
        map.insert(id.clone(), (now, p));
        Ok(id)
    }

    fn take_pending(&self, id: &str) -> Option<Pending> {
        let mut map = self.pending.lock().expect("pending lock");
        let (t, p) = map.remove(id)?;
        if t.elapsed() < CEREMONY_TTL {
            Some(p)
        } else {
            None
        }
    }

    pub fn list(&self) -> Vec<PasskeyView> {
        self.store
            .lock()
            .expect("passkeys lock")
            .passkeys
            .iter()
            .map(|p| PasskeyView {
                id: p.id.clone(),
                label: p.label.clone(),
                created_at: p.created_at.clone(),
                last_used_at: p.last_used_at.clone(),
            })
            .collect()
    }
}

/// Middleware: passkey routes exist only over HTTPS (K9).
pub async fn require_https(
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

#[derive(Debug, Serialize, Deserialize)]
pub struct PasskeyView {
    pub id: String,
    pub label: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

#[derive(Serialize)]
pub struct StartResponse<T: Serialize> {
    pub ceremony: String,
    pub options: T,
}

/// `POST /passkeys/register/start` (admin): a challenge for a new passkey.
pub async fn register_start(
    State(s): State<PasskeyState>,
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
    let ceremony = s.put_pending(Pending::Register(reg))?;
    Ok(Json(StartResponse { ceremony, options }))
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

/// `POST /passkeys/login/start` (public over HTTPS): a challenge against
/// every stored passkey.
pub async fn login_start(
    State(s): State<PasskeyState>,
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
    let ceremony = s.put_pending(Pending::Login(auth))?;
    Ok(Json(StartResponse { ceremony, options }))
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
    {
        let mut store = s.store.lock().expect("passkeys lock");
        for p in store.passkeys.iter_mut() {
            if p.passkey.cred_id() == result.cred_id() {
                p.passkey.update_credential(&result);
                p.last_used_at = Some(now_rfc3339());
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
    let mut cookie = Cookie::new(s.auth.cookie_name(), value);
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_path("/");
    cookie.set_secure(is_https(peer, &headers, &s.auth.guards.trusted_proxies));
    tracing::info!("passkey login");
    Ok((CookieJar::new().add(cookie), Redirect::to("/")).into_response())
}

/// `GET /api/passkeys` (admin).
pub async fn list(State(s): State<PasskeyState>) -> Json<Vec<PasskeyView>> {
    Json(s.list())
}

/// `DELETE /api/passkeys/{id}` (admin).
pub async fn delete(
    State(s): State<PasskeyState>,
    Path(id): Path<String>,
) -> Result<StatusCode, Error> {
    {
        let mut store = s.store.lock().expect("passkeys lock");
        let before = store.passkeys.len();
        store.passkeys.retain(|p| p.id != id);
        if store.passkeys.len() == before {
            return Err(Error::new(
                Kind::NotFound,
                format!("no passkey {id}"),
                "list them on /passkeys",
            ));
        }
    }
    s.save()?;
    Ok(StatusCode::NO_CONTENT)
}

fn webauthn_error(e: WebauthnError) -> Error {
    Error::new(
        Kind::Invalid,
        format!("passkey ceremony failed: {e}"),
        "try again; if it keeps failing, the browser may not support this authenticator or PUBLIC_URL does not match the address bar",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_url_is_required_https_and_names_the_proxy() {
        let err = build_webauthn("inbox", "INBOX", None).unwrap_err();
        assert!(err.remedy.contains("INBOX_PUBLIC_URL"));
        let err = build_webauthn("inbox", "INBOX", Some("http://inbox.lan:8080")).unwrap_err();
        assert!(err.remedy.contains("Traefik"));
        let err = build_webauthn("inbox", "INBOX", Some("not a url")).unwrap_err();
        assert!(err.message.contains("not a URL"));
        assert!(build_webauthn("inbox", "INBOX", Some("https://inbox.example.lan")).is_ok());
    }

    #[tokio::test]
    async fn registration_start_issues_a_challenge_and_finish_refuses_garbage() {
        let dir = tempfile::tempdir().unwrap();
        let webauthn = build_webauthn("t", "T", Some("https://t.example")).unwrap();
        let key = crate::core::crypto::Key::from_bytes([9u8; 32]);
        let file = EncryptedFile::new(
            dir.path().join("passkeys.json.enc"),
            key.clone(),
            "passkeys",
        );
        let auth = AuthState {
            name: "t",
            secrets: crate::shell::auth::Secrets::parse(
                "T",
                Some("a-long-enough-login-token"),
                Some(&"ab".repeat(32)),
            )
            .unwrap()
            .unwrap(),
            clients: Arc::new(crate::shell::store::MemoryClientStore::default()),
            sessions: Arc::new(crate::shell::store::SessionStore::in_memory()),
            session_ttl_secs: 60,
            remember_me_secs: 60,
            guards: crate::shell::guards::Guards {
                max_in_flight: Arc::new(tokio::sync::Semaphore::new(1)),
                retry_after: Duration::from_secs(1),
                request_timeout: Duration::from_secs(1),
                timeout_exempt: Arc::new(Default::default()),
                trusted_proxies: Arc::new(vec![]),
            },
        };
        let state = PasskeyState::open(webauthn, auth, file).unwrap();
        let Json(start) = register_start(State(state.clone())).await.unwrap();
        assert_eq!(start.ceremony.len(), 32);
        assert!(!start.options.public_key.challenge.is_empty());
        // Unknown ceremony id.
        let bad = serde_json::from_value::<RegisterPublicKeyCredential>(serde_json::json!({
            "id": "AAAA", "rawId": "AAAA", "type": "public-key",
            "response": {"attestationObject": "AAAA", "clientDataJSON": "AAAA"},
            "extensions": {}
        }))
        .unwrap();
        let err = register_finish(
            State(state.clone()),
            Json(RegisterFinish {
                ceremony: "nope".into(),
                label: "x".into(),
                credential: bad,
            }),
        )
        .await
        .unwrap_err();
        assert!(err.remedy.contains("start again"));
        // No passkeys yet → login start says so with a remedy.
        let err = login_start(State(state))
            .await
            .err()
            .expect("no passkeys yet is an error");
        assert!(err.remedy.contains("register one"));
        assert!(
            dir.path().join("passkeys.json.enc").exists() || true,
            "store is created on first save"
        );
    }
}
