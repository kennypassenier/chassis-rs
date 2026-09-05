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

/// temp + fsync + rename, then fsync the directory (rule 12).
pub fn write_atomic(path: &Path, bytes: &[u8], what: &str) -> Result<(), Error> {
    use std::io::Write;
    let dir = path.parent().ok_or_else(|| {
        Error::internal(
            format!("{} has no parent directory", path.display()),
            "report this",
        )
    })?;
    std::fs::create_dir_all(dir).map_err(|e| {
        Error::config(
            format!("cannot create {} for {what}: {e}", dir.display()),
            "create the state directory and make the service user its owner",
        )
    })?;
    let tmp = dir.join(format!(
        ".{}.tmp-{}",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("store"),
        std::process::id()
    ));
    let io = |e: std::io::Error| {
        Error::config(
            format!("cannot write {what} to {}: {e}", path.display()),
            "check free space and the state directory's permissions",
        )
    };
    let mut f = std::fs::File::create(&tmp).map_err(io)?;
    f.write_all(bytes).map_err(io)?;
    f.sync_all().map_err(io)?;
    drop(f);
    std::fs::rename(&tmp, path).map_err(io)?;
    if let Ok(d) = std::fs::File::open(dir) {
        let _ = d.sync_all();
    }
    Ok(())
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

impl ClientStore for FileClientStore {
    fn snapshot(&self) -> ClientsFile {
        self.state.read().expect("clients lock").clone()
    }

    fn update(
        &self,
        f: &mut dyn FnMut(&mut ClientsFile) -> Result<Client, Error>,
    ) -> Result<Client, Error> {
        let mut guard = self.state.write().expect("clients lock");
        let mut working = guard.clone();
        let client = f(&mut working)?;
        self.file.save(&working)?;
        *guard = working;
        Ok(client)
    }

    fn touch(&self, id: &str, now: &str) {
        self.state.write().expect("clients lock").touch(id, now);
    }

    fn persist(&self) -> Result<(), Error> {
        let snapshot = self.state.read().expect("clients lock").clone();
        self.file.save(&snapshot)
    }
}

/// Clients in memory only: tests, and the second implementation the
/// shared suite needs (rule 7g).
#[derive(Default)]
pub struct MemoryClientStore {
    state: std::sync::RwLock<ClientsFile>,
}

impl ClientStore for MemoryClientStore {
    fn snapshot(&self) -> ClientsFile {
        self.state.read().expect("clients lock").clone()
    }

    fn update(
        &self,
        f: &mut dyn FnMut(&mut ClientsFile) -> Result<Client, Error>,
    ) -> Result<Client, Error> {
        let mut guard = self.state.write().expect("clients lock");
        let mut working = guard.clone();
        let client = f(&mut working)?;
        *guard = working;
        Ok(client)
    }

    fn touch(&self, id: &str, now: &str) {
        self.state.write().expect("clients lock").touch(id, now);
    }

    fn persist(&self) -> Result<(), Error> {
        Ok(())
    }
}

/// Shared handle type the handlers use.
pub type Clients = Arc<dyn ClientStore>;

/// Sessions live behind an async lock because the login handler awaits
/// around them; the file is small and rewritten on every change.
pub struct SessionStore {
    file: Option<EncryptedFile>,
    pub state: RwLock<crate::core::session::SessionsFile>,
}

impl SessionStore {
    pub fn open(file: EncryptedFile) -> Result<Self, Error> {
        let loaded = file.load()?.unwrap_or_default();
        Ok(Self {
            file: Some(file),
            state: RwLock::new(loaded),
        })
    }

    pub fn in_memory() -> Self {
        Self {
            file: None,
            state: RwLock::new(Default::default()),
        }
    }

    pub async fn save(&self) -> Result<(), Error> {
        if let Some(f) = &self.file {
            let snapshot = self.state.read().await.clone();
            f.save(&snapshot)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> Key {
        Key::from_bytes([3u8; 32])
    }

    #[test]
    fn encrypted_file_round_trips_and_is_unreadable_as_plaintext() {
        let dir = tempfile::tempdir().unwrap();
        let f = EncryptedFile::new(dir.path().join("clients.json.enc"), key(), "clients");
        assert!(f.load::<ClientsFile>().unwrap().is_none());
        let mut c = ClientsFile::default();
        c.issue(
            "ha",
            "id".into(),
            "very-secret-token".into(),
            "2026-09-05T07:00:00Z",
        )
        .unwrap();
        f.save(&c).unwrap();
        let raw = std::fs::read_to_string(f.path()).unwrap();
        assert!(
            !raw.contains("very-secret-token"),
            "plaintext must never touch disk"
        );
        assert!(raw.contains("\"v\": 1"));
        let back: ClientsFile = f.load().unwrap().unwrap();
        assert_eq!(back, c);
        // No temp file left behind.
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn wrong_key_is_a_config_error_naming_rekey() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.enc");
        EncryptedFile::new(path.clone(), key(), "s")
            .save(&ClientsFile::default())
            .unwrap();
        let err = EncryptedFile::new(path, Key::from_bytes([4u8; 32]), "s")
            .load::<ClientsFile>()
            .unwrap_err();
        assert!(err.remedy.contains("rekey"));
    }

    // Rule 7g: one suite, every implementation.
    fn drive(store: &dyn ClientStore) {
        let now = "2026-09-05T07:00:00Z";
        let c = store
            .update(&mut |f| f.issue("ha", "id-1".into(), "tok".into(), now).cloned())
            .unwrap();
        assert_eq!(c.name, "ha");
        assert!(store.snapshot().by_token("tok").is_some());
        // A failing change persists nothing.
        let err = store
            .update(&mut |f| f.issue("ha", "id-2".into(), "tok2".into(), now).cloned())
            .unwrap_err();
        assert!(err.message.contains("already"));
        assert_eq!(store.snapshot().clients.len(), 1);
        store.touch("id-1", now);
        assert_eq!(store.snapshot().get("id-1").unwrap().uses, 1);
        store.persist().unwrap();
        store
            .update(&mut |f| f.revoke("id-1", now).cloned())
            .unwrap();
        assert!(store.snapshot().by_token("tok").is_none());
    }

    #[test]
    fn file_and_memory_stores_pass_the_same_suite() {
        let dir = tempfile::tempdir().unwrap();
        let file = EncryptedFile::new(dir.path().join("clients.json.enc"), key(), "clients");
        let store = FileClientStore::open(file.clone()).unwrap();
        drive(&store);
        // Reopen: the revoke survived, the touch was persisted.
        let reopened = FileClientStore::open(file).unwrap();
        let snap = reopened.snapshot();
        assert!(snap.get("id-1").unwrap().revoked_at.is_some());
        assert_eq!(snap.get("id-1").unwrap().uses, 1);

        drive(&MemoryClientStore::default());
    }
}
