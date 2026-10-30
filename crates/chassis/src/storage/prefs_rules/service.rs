//! The `Prefs` service: the rules applied to one key or value, then the store
//! calls behind the preference routes.

use std::collections::BTreeMap;
use std::sync::Arc;

use serde_json::{Value as Json, json};

use super::secrets::{key_ok, looks_like_secret, looks_secret_name};
use super::{BrowserKeys, PrefLimits, Prefs};
use crate::core::error::Error;
use crate::storage::prefs::{PrefStore, SetOutcome};

impl Prefs {
    pub fn new(store: Arc<dyn PrefStore>, keys: BrowserKeys, limits: PrefLimits) -> Self {
        Prefs {
            store,
            keys: Arc::new(keys),
            limits,
            forbidden_values: Arc::new(Vec::new()),
        }
    }

    /// Refuse any value containing one of these (the service's own secrets,
    /// when they are longer than 7 bytes).
    pub(crate) fn forbid_values(mut self, values: Vec<String>) -> Self {
        self.forbidden_values = Arc::new(values.into_iter().filter(|v| v.len() >= 8).collect());
        self
    }

    pub fn keys(&self) -> &BrowserKeys {
        &self.keys
    }

    pub fn limits(&self) -> PrefLimits {
        self.limits
    }

    /// A key of a request: syntax, then the declaration.
    pub fn check_key(&self, key: &str) -> Result<(), Error> {
        if !key_ok(key) {
            return Err(Error::invalid(
                format!("`{key:.40}` is not a valid preference key"),
                "1 to 256 bytes, no control characters, not `.` or `..`",
            ));
        }
        if looks_secret_name(key) {
            return Err(Error::invalid(
                format!("`{key}` looks like it names a secret and is never stored"),
                "preferences are plain text; keep secrets out of them",
            ));
        }
        if !self.keys.is_synced(key) {
            return Err(Error::invalid(
                format!("`{key}` is not a key this service syncs"),
                "the service declares its synced keys with App::sync_browser_keys; the kit never syncs a key it was not told to",
            ));
        }
        Ok(())
    }

    /// A value of a request: size, then whether it looks like a secret.
    pub fn check_value(&self, value: &str) -> Result<(), Error> {
        if value.len() as u64 > self.limits.max_value_bytes {
            return Err(Error::invalid(
                format!(
                    "the value is {} bytes; one preference holds at most {}",
                    value.len(),
                    self.limits.max_value_bytes
                ),
                "store less in one key, or raise <P>_PREFS_MAX_VALUE_BYTES",
            ));
        }
        if let Some(why) = looks_like_secret(value, &self.forbidden_values) {
            return Err(Error::invalid(
                format!("the value looks like {why} and is never stored"),
                "preferences are plain text in the app database; keep secrets out of them",
            ));
        }
        Ok(())
    }

    /// Store one preference for `scope`.
    pub async fn put(&self, scope: &str, key: &str, value: &str) -> Result<(), Error> {
        self.check_key(key)?;
        self.check_value(value)?;
        match self
            .store
            .set(scope, key, value, self.limits.quota())
            .await?
        {
            SetOutcome::Stored => Ok(()),
            SetOutcome::ScopeFull { used_bytes, keys } => Err(Error::new(
                crate::core::error::Kind::Overloaded,
                format!(
                    "the preferences are full: {used_bytes} of {} bytes and {keys} of {} keys are used",
                    self.limits.max_scope_bytes, self.limits.max_keys
                ),
                "delete preferences on the Storage page, or raise <P>_PREFS_MAX_SCOPE_BYTES / <P>_PREFS_MAX_KEYS",
            )),
        }
    }

    /// Remove one preference; `false` when it was not there.
    pub async fn delete(&self, scope: &str, key: &str) -> Result<bool, Error> {
        self.check_key(key)?;
        self.store.remove(scope, key).await
    }

    /// The synced preferences of `scope` under `prefix`, by key. A row whose
    /// key the service no longer declares is not served.
    pub async fn list(&self, scope: &str, prefix: &str) -> Result<BTreeMap<String, String>, Error> {
        Ok(self
            .store
            .list(scope, prefix)
            .await?
            .into_iter()
            .filter(|(k, _)| self.keys.is_synced(k))
            .collect())
    }

    /// What a page carries: the values, the declaration and the limits.
    pub async fn snapshot(&self, scope: &str, prefix: &str) -> Result<Json, Error> {
        let all = self.list(scope, prefix).await?;
        let (keys, session): (BTreeMap<_, _>, BTreeMap<_, _>) = all
            .into_iter()
            .partition(|(k, _)| self.keys.is_synced_local(k));
        Ok(json!({
            "v": 1,
            "scope": scope,
            "keys": keys,
            "session": session,
            "synced": self.keys.to_json(),
            "limits": self.limits,
        }))
    }
}
