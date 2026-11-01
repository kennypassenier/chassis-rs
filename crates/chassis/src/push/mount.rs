//! Wiring push into a starting app: open the sender on the kit file, make or
//! read the VAPID key, connect the app's handle and return the API routes.
//!
//! The VAPID private key is sealed with the same key and envelope as the
//! kit's client tokens (`<PREFIX>_SECRET_KEY`) and kept in the kit file, so a
//! copy of the file alone does not let anyone send as this service. A
//! dashboard that runs open (no login, no secret key) gets no push: there is
//! no key to seal with, and a key that changed at every start would orphan
//! every subscription.

use axum::Router;
use axum::middleware::from_fn_with_state;

use super::api::{PushState, encode_public_key, routes};
use super::config::PushKnobs;
use super::handle::PushHandle;
use super::keys::{VapidKey, generate_pkcs8};
use super::sender::Sender;
use crate::core::crypto::{Key, NONCE_LEN, Sealed, open, seal};
use crate::core::error::Error;
use crate::shell::auth::{AuthState, require_admin};
use crate::shell::config_load::Loaded;
use crate::storage::Db;
use crate::storage::push_store::PushStore;

/// What the dashboard mount hands over.
pub(crate) struct PushInput<'a> {
    pub loaded: &'a Loaded,
    pub kit: &'a Db,
    pub seal_key: &'a Key,
    /// The dashboard runs without a login.
    pub open: bool,
    pub handle: &'a PushHandle,
    pub auth: &'a AuthState,
}

/// Connect the handle and build the API routes (behind the admin login);
/// an empty router when the dashboard runs open.
pub(crate) fn mount(input: PushInput<'_>) -> Result<Router, Error> {
    if input.open {
        tracing::warn!(
            "push: off, because the dashboard runs open and there is no key to seal the VAPID secret with"
        );
        return Ok(Router::new());
    }
    let knobs = PushKnobs::parse(input.loaded)?;
    let store = PushStore::new(input.kit.clone(), knobs.max_subscriptions);
    let key = load_or_create_key(&store, input.seal_key)?;
    let state = PushState {
        store: store.clone(),
        public_key: encode_public_key(key.public_key()),
    };
    input.handle.connect(Sender::new(store, key, knobs)?);
    Ok(routes(state).layer(from_fn_with_state(input.auth.clone(), require_admin)))
}

/// The app's VAPID key: read and unseal the stored one, or make and store a
/// new one on the first start.
pub(crate) fn load_or_create_key(store: &PushStore, seal_key: &Key) -> Result<VapidKey, Error> {
    let sealed = match store.vapid_sealed()? {
        Some(existing) => existing,
        None => store.set_vapid_sealed(&seal_text(seal_key, &generate_pkcs8()?)?)?,
    };
    let pkcs8 = open_text(seal_key, &sealed)?;
    VapidKey::from_pkcs8(&pkcs8)
}

fn seal_text(key: &Key, plain: &[u8]) -> Result<String, Error> {
    let mut nonce = [0u8; NONCE_LEN];
    getrandom::fill(&mut nonce)
        .map_err(|e| Error::internal(format!("random nonce: {e}"), "report this"))?;
    let sealed = seal(key, &nonce, plain)?;
    serde_json::to_string(&sealed)
        .map_err(|e| Error::internal(format!("serialise: {e}"), "report this"))
}

fn open_text(key: &Key, text: &str) -> Result<Vec<u8>, Error> {
    let sealed: Sealed = serde_json::from_str(text).map_err(|e| {
        Error::config(
            format!("the stored VAPID key in the kit database is not an envelope: {e}"),
            "delete the `push_vapid_key` row of chassis_meta to make a new key; every browser then subscribes again",
        )
    })?;
    open(key, &sealed, "the VAPID key")
}

#[cfg(test)]
mod tests;
