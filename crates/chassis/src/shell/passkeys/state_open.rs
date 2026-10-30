//! Opening a `PasskeyState` from an encrypted file or the kit database.

use std::sync::{Arc, Mutex};

use webauthn_rs::prelude::*;

use super::{
    Ceremonies, CeremonyLimits, PASSKEYS_FORMAT, PasskeyState, PasskeysFile, StoredPasskey,
};
use crate::core::error::Error;
use crate::shell::auth::AuthState;
use crate::shell::store::EncryptedFile;

impl PasskeyState {
    /// Passkeys in the kit database (3.11.0); the credential is sealed per
    /// row with the same key.
    #[cfg(feature = "dashboard")]
    pub(crate) fn open_db(
        webauthn: Webauthn,
        auth: AuthState,
        kit: crate::storage::KitDb,
        limits: CeremonyLimits,
        guards: crate::shell::guards::Guards,
    ) -> Result<Self, Error> {
        let passkeys = kit
            .load_passkeys()?
            .into_iter()
            .map(|r| {
                Ok(StoredPasskey {
                    id: r.id,
                    label: r.label,
                    created_at: r.created_at,
                    last_used_at: r.last_used_at,
                    passkey: serde_json::from_str(&r.credential_json).map_err(|e| {
                        Error::config(
                            format!("a stored passkey does not parse: {e}"),
                            "restore the kit database from the last backup or pre-update copy",
                        )
                    })?,
                })
            })
            .collect::<Result<Vec<_>, Error>>()?;
        Ok(Self {
            webauthn: Arc::new(webauthn),
            auth,
            file: None,
            kit: Some(kit),
            store: Arc::new(Mutex::new(PasskeysFile {
                v: PASSKEYS_FORMAT,
                passkeys,
            })),
            pending: Arc::new(Mutex::new(Ceremonies::new(limits))),
            guards,
            logins: Arc::default(),
        })
    }

    pub fn open(
        webauthn: Webauthn,
        auth: AuthState,
        file: EncryptedFile,
        limits: CeremonyLimits,
        guards: crate::shell::guards::Guards,
    ) -> Result<Self, Error> {
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
            file: Some(file),
            #[cfg(feature = "dashboard")]
            kit: None,
            store: Arc::new(Mutex::new(loaded)),
            pending: Arc::new(Mutex::new(Ceremonies::new(limits))),
            guards,
            logins: Arc::default(),
        })
    }
}
