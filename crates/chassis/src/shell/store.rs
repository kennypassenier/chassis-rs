//! Encrypted JSON files under the state root (AR5): how clients, sessions
//! and passkeys are kept.
//!
//! One file per store, sealed with `core::crypto` under the secret key,
//! written temp + fsync + rename so a crash leaves either the old file or
//! the new one (rule 12, AR9). The decrypted JSON carries its own format
//! version; the caller's type checks it (K21). The `ClientStore` trait is
//! the seam kyu uses to keep its SQLite table: the kit ships a file
//! implementation and an in-memory one, and one suite drives both
//! (rule 7g).

mod atomic;
mod clients;
mod rekey;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use serde::de::DeserializeOwned;
use tokio::sync::RwLock;

use crate::core::clients::{Client, ClientsFile};
use crate::core::crypto::{Key, NONCE_LEN, Sealed, open, seal};
use crate::core::error::Error;

/// A sealed JSON file for one value.
#[derive(Clone)]
pub struct EncryptedFile {
    path: PathBuf,
    key: Key,
    what: &'static str,
}

impl EncryptedFile {
    pub fn new(path: PathBuf, key: Key, what: &'static str) -> Self {
        Self { path, key, what }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Load and decrypt; `None` when the file does not exist yet.
    pub fn load<T: DeserializeOwned>(&self) -> Result<Option<T>, Error> {
        let bytes = match std::fs::read(&self.path) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => {
                return Err(Error::config(
                    format!("cannot read {} ({}): {e}", self.what, self.path.display()),
                    "check the state directory's permissions; the service user must own it",
                ));
            }
        };
        let sealed: Sealed = serde_json::from_slice(&bytes).map_err(|e| {
            Error::config(
                format!(
                    "{} ({}) is not a sealed store: {e}",
                    self.what,
                    self.path.display()
                ),
                "the file is corrupt; restore it from the last backup or pre-update copy",
            )
        })?;
        let plain = open(&self.key, &sealed, self.what)?;
        let value: T = serde_json::from_slice(&plain).map_err(|e| {
            Error::config(
                format!("{} decrypted but does not parse: {e}", self.what),
                "the file is corrupt; restore it from the last backup or pre-update copy",
            )
        })?;
        Ok(Some(value))
    }

    /// Encrypt and write atomically.
    pub fn save<T: Serialize>(&self, value: &T) -> Result<(), Error> {
        let plain = serde_json::to_vec(value)
            .map_err(|e| Error::internal(format!("serialise {}: {e}", self.what), "report this"))?;
        let mut nonce = [0u8; NONCE_LEN];
        getrandom::fill(&mut nonce)
            .map_err(|e| Error::internal(format!("random nonce: {e}"), "report this"))?;
        let sealed = seal(&self.key, &nonce, &plain)?;
        let bytes = serde_json::to_vec_pretty(&sealed).expect("sealed serialises");
        write_atomic(&self.path, &bytes, self.what)
    }
}

/// Re-seal every `*.json.enc` under `dir` from `old` to `new` (K8, critic
/// #11). A file that already opens with `new` is left alone, so a rerun
/// after a partial failure is safe. Returns how many files were re-sealed.
pub fn rekey_dir(dir: &Path, old: &Key, new: &Key) -> Result<usize, Error> {
    rekey::run(dir, old, new)
}

/// Built-in `/healthz` subsystem: is the state root taking writes? Ok until
/// a write fails, failing until the next write succeeds.
pub struct StoreSubsystem;

/// Prove the state directory takes a write (H11, rule 12 fail-closed):
/// create it when `create` (start), refuse a missing one otherwise
/// (`--check` never creates), then write and remove a zero-byte probe.
pub fn probe_state_dir(dir: &Path, create: bool) -> Result<(), Error> {
    atomic::probe(dir, create)
}

/// temp + fsync + rename, then fsync the directory (rule 12).
pub fn write_atomic(path: &Path, bytes: &[u8], what: &str) -> Result<(), Error> {
    atomic::write(path, bytes, what)
}

/// The seam for client persistence (K12). Methods are synchronous and
/// cheap; the file store holds everything in memory and writes on change.
pub trait ClientStore: Send + Sync {
    /// The current state, for listing and for token lookup.
    fn snapshot(&self) -> ClientsFile;
    /// Apply a change and persist it. `f` mutates the file; persistence
    /// happens only when `f` returned `Ok`.
    fn update(
        &self,
        f: &mut dyn FnMut(&mut ClientsFile) -> Result<Client, Error>,
    ) -> Result<Client, Error>;
    /// Record a use without persisting (debounced by the caller, AR7/#13).
    fn touch(&self, id: &str, now: &str);
    /// Persist what `touch` accumulated.
    fn persist(&self) -> Result<(), Error>;
}

/// Clients in an encrypted file under the state root.
pub struct FileClientStore {
    file: EncryptedFile,
    state: std::sync::RwLock<ClientsFile>,
}

impl FileClientStore {
    /// Load the store or start empty; verifies the format (K21).
    pub fn open(file: EncryptedFile) -> Result<Self, Error> {
        let loaded: ClientsFile = file.load()?.unwrap_or_default();
        loaded.check_format()?;
        Ok(Self {
            file,
            state: std::sync::RwLock::new(loaded),
        })
    }
}

/// Clients in the kit database (`<name>-kit.db`, 3.11.0): the same
/// in-memory model as [`FileClientStore`], persisted as rows with the token
/// and the project's field values sealed per field.
#[cfg(feature = "dashboard")]
pub(crate) struct DbClientStore {
    kit: crate::storage::KitDb,
    state: std::sync::RwLock<ClientsFile>,
}

/// Clients in memory only: tests, and the second implementation the
/// shared suite needs (rule 7g).
#[derive(Default)]
pub struct MemoryClientStore {
    state: std::sync::RwLock<ClientsFile>,
}

/// Shared handle type the handlers use.
pub type Clients = Arc<dyn ClientStore>;

/// Sessions live behind an async lock because the login handler awaits
/// around them; the file is small and rewritten on every change.
pub struct SessionStore {
    file: Option<EncryptedFile>,
    /// 3.11.0: the kit database, when the sessions live there.
    #[cfg(feature = "dashboard")]
    kit: Option<crate::storage::KitDb>,
    pub state: RwLock<crate::core::session::SessionsFile>,
}

impl SessionStore {
    pub fn open(file: EncryptedFile) -> Result<Self, Error> {
        let loaded = file.load()?.unwrap_or_default();
        Ok(Self {
            file: Some(file),
            #[cfg(feature = "dashboard")]
            kit: None,
            state: RwLock::new(loaded),
        })
    }

    /// Sessions in the kit database (3.11.0).
    #[cfg(feature = "dashboard")]
    pub(crate) fn open_db(kit: crate::storage::KitDb) -> Result<Self, Error> {
        let loaded = kit.load_sessions()?;
        Ok(Self {
            file: None,
            kit: Some(kit),
            state: RwLock::new(loaded),
        })
    }

    pub fn in_memory() -> Self {
        Self {
            file: None,
            #[cfg(feature = "dashboard")]
            kit: None,
            state: RwLock::new(Default::default()),
        }
    }

    pub async fn save(&self) -> Result<(), Error> {
        #[cfg(feature = "dashboard")]
        if let Some(kit) = &self.kit {
            let snapshot = self.state.read().await.clone();
            return kit.save_sessions(snapshot).await;
        }
        if let Some(f) = &self.file {
            let snapshot = self.state.read().await.clone();
            f.save(&snapshot)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
