//! `PasskeyState` operations: persisting, pending ceremonies, listings and
//! the session-to-passkey memory.

use std::net::SocketAddr;
use std::time::Instant;

use axum::http::HeaderMap;
use axum_extra::extract::cookie::CookieJar;

use super::{LOGINS_CAP, PasskeyListing, PasskeyState, PasskeyView, Pending};
use crate::core::crypto::sha256_hex;
use crate::core::error::Error;
use crate::shell::time::{now_epoch, random_hex};

impl PasskeyState {
    pub(super) fn save(&self) -> Result<(), Error> {
        let snapshot = self.store.lock().expect("passkeys lock").clone();
        #[cfg(feature = "dashboard")]
        if let Some(kit) = &self.kit {
            let rows = snapshot
                .passkeys
                .iter()
                .map(|p| {
                    Ok(crate::storage::PasskeyRow {
                        id: p.id.clone(),
                        label: p.label.clone(),
                        created_at: p.created_at.clone(),
                        last_used_at: p.last_used_at.clone(),
                        credential_json: serde_json::to_string(&p.passkey).map_err(|e| {
                            Error::internal(format!("serialise a passkey: {e}"), "report this")
                        })?,
                    })
                })
                .collect::<Result<Vec<_>, Error>>()?;
            return kit.save_passkeys(&rows);
        }
        match &self.file {
            Some(file) => file.save(&snapshot),
            None => Ok(()),
        }
    }

    pub(super) fn put_pending(
        &self,
        peer: SocketAddr,
        headers: &HeaderMap,
        p: Pending,
    ) -> Result<String, Error> {
        let id = random_hex(16)?;
        let ip = crate::shell::guards::client_ip(peer, headers, &self.guards.trusted_proxies);
        self.pending
            .lock()
            .expect("pending lock")
            .put(Instant::now(), ip, id.clone(), p);
        Ok(id)
    }

    pub(super) fn take_pending(&self, id: &str) -> Option<Pending> {
        self.pending
            .lock()
            .expect("pending lock")
            .take(id, Instant::now())
    }

    pub(super) fn list_views(&self) -> Vec<PasskeyView> {
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

    /// Every passkey, with `current` set on the one whose store id is
    /// `current` (the passkey this session logged in with).
    pub fn list_for(&self, current: Option<&str>) -> Vec<PasskeyListing> {
        self.list_views()
            .into_iter()
            .map(|view| PasskeyListing {
                current: current == Some(view.id.as_str()),
                view,
            })
            .collect()
    }

    /// Remember that the session for `cookie_value` was opened with the
    /// stored passkey `passkey_id`. In memory, bounded: a restart forgets
    /// it and the next passkey login records it again.
    pub(super) fn remember_login(&self, cookie_value: &str, passkey_id: &str) {
        let mut map = self.logins.lock().expect("logins lock");
        if map.len() >= LOGINS_CAP
            && let Some(oldest) = map
                .iter()
                .min_by_key(|(_, (t, _))| *t)
                .map(|(k, _)| k.clone())
        {
            map.remove(&oldest);
        }
        map.insert(
            sha256_hex(cookie_value.as_bytes()),
            (now_epoch(), passkey_id.to_string()),
        );
    }

    /// The passkeys as seen by the caller whose request carried `headers`:
    /// `current` marks the passkey that caller's session was opened with.
    pub async fn list_for_request(&self, headers: &HeaderMap) -> Vec<PasskeyListing> {
        let jar = CookieJar::from_headers(headers);
        let current = match jar.get(&self.auth.cookie_name()) {
            Some(c)
                if self
                    .auth
                    .sessions
                    .state
                    .read()
                    .await
                    .is_live(c.value(), now_epoch()) =>
            {
                self.logins
                    .lock()
                    .expect("logins lock")
                    .get(&sha256_hex(c.value().as_bytes()))
                    .map(|(_, id)| id.clone())
            }
            _ => None,
        };
        self.list_for(current.as_deref())
    }
}
