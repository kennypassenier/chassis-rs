//! The rules around the preference port (3.12.0): which browser keys sync
//! ([`BrowserKeys`]), the limits, the refusal of anything that looks like a
//! secret, and the [`Prefs`] service the routes and the page injection use.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use serde::Serialize;
use serde_json::{Value as Json, json};

use super::prefs::{PrefStore, Quota, SetOutcome};
use crate::core::error::Error;

mod declaration;
mod secrets;
#[cfg(test)]
mod tests;

pub(crate) use secrets::looks_secret_name;
use secrets::{key_ok, looks_like_secret};

/// The limits of the preferences, with the defaults the kit ships.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[non_exhaustive]
pub struct PrefLimits {
    /// Largest value, in bytes.
    pub max_value_bytes: u64,
    /// Largest sum of keys and values of one scope, in bytes.
    pub max_scope_bytes: u64,
    /// Most keys one scope may hold.
    pub max_keys: u64,
}

impl PrefLimits {
    pub const DEFAULT_MAX_VALUE_BYTES: u64 = 16 * 1024;
    pub const DEFAULT_MAX_SCOPE_BYTES: u64 = 256 * 1024;
    pub const DEFAULT_MAX_KEYS: u64 = 512;
    /// The longest key, in bytes.
    pub const MAX_KEY_BYTES: usize = 256;

    pub(crate) fn quota(&self) -> Quota {
        Quota {
            max_scope_bytes: self.max_scope_bytes,
            max_keys: self.max_keys,
        }
    }
}

impl Default for PrefLimits {
    fn default() -> Self {
        PrefLimits {
            max_value_bytes: Self::DEFAULT_MAX_VALUE_BYTES,
            max_scope_bytes: Self::DEFAULT_MAX_SCOPE_BYTES,
            max_keys: Self::DEFAULT_MAX_KEYS,
        }
    }
}

/// Which `localStorage` keys of the browser sync to the database: the
/// allow-list (exact keys and prefixes) minus the exceptions. Nothing else
/// ever syncs. **Never declare a key that holds a secret**: preferences are
/// plain text in the app database and in the page.
///
/// ```
/// use chassis::storage::BrowserKeys;
/// let keys = BrowserKeys::new()
///     .prefix("homelab.")
///     .prefix("kp-remember:")
///     .exact("nx-sort")
///     .except_exact("homelab.theme-light");
/// assert!(keys.is_synced("homelab.log-levels"));
/// assert!(!keys.is_synced("homelab.theme-light"));
/// assert!(!keys.is_synced("theme"));
/// ```
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[non_exhaustive]
pub struct BrowserKeys {
    pub allow_exact: BTreeSet<String>,
    pub allow_prefix: BTreeSet<String>,
    /// Keys of `sessionStorage` that sync too (the one exception to "the
    /// per-tab store stays in the tab"; see `docs/DASHBOARD.md`).
    pub session_exact: BTreeSet<String>,
    pub session_prefix: BTreeSet<String>,
    pub deny_exact: BTreeSet<String>,
    pub deny_prefix: BTreeSet<String>,
    #[serde(skip)]
    limits: Option<PrefLimits>,
}

impl BrowserKeys {
    pub fn new() -> Self {
        Self::default()
    }

    /// Sync this exact key.
    pub fn exact(mut self, key: &str) -> Self {
        self.allow_exact.insert(key.into());
        self
    }

    /// Sync every key that starts with `prefix`.
    pub fn prefix(mut self, prefix: &str) -> Self {
        self.allow_prefix.insert(prefix.into());
        self
    }

    /// Sync this exact key of `sessionStorage` (kp-themes' unsaved-changes
    /// bar keeps its draft there). A tab's other keys stay in the tab.
    pub fn session_exact(mut self, key: &str) -> Self {
        self.session_exact.insert(key.into());
        self
    }

    /// Sync every `sessionStorage` key starting with `prefix`, such as
    /// `kp-unsaved:`.
    pub fn session_prefix(mut self, prefix: &str) -> Self {
        self.session_prefix.insert(prefix.into());
        self
    }

    /// Do not sync this exact key, whatever the allow-list says.
    pub fn except_exact(mut self, key: &str) -> Self {
        self.deny_exact.insert(key.into());
        self
    }

    /// Do not sync any key starting with `prefix`.
    pub fn except_prefix(mut self, prefix: &str) -> Self {
        self.deny_prefix.insert(prefix.into());
        self
    }

    /// Largest value in bytes (default 16 KiB). `<P>_PREFS_MAX_VALUE_BYTES`
    /// wins.
    pub fn max_value_bytes(mut self, n: u64) -> Self {
        let mut l = self.limits.unwrap_or_default();
        l.max_value_bytes = n;
        self.limits = Some(l);
        self
    }

    /// Largest total of one scope in bytes (default 256 KiB).
    /// `<P>_PREFS_MAX_SCOPE_BYTES` wins.
    pub fn max_scope_bytes(mut self, n: u64) -> Self {
        let mut l = self.limits.unwrap_or_default();
        l.max_scope_bytes = n;
        self.limits = Some(l);
        self
    }

    /// Most keys per scope (default 512). `<P>_PREFS_MAX_KEYS` wins.
    pub fn max_keys(mut self, n: u64) -> Self {
        let mut l = self.limits.unwrap_or_default();
        l.max_keys = n;
        self.limits = Some(l);
        self
    }

    pub(crate) fn code_limits(&self) -> PrefLimits {
        self.limits.unwrap_or_default()
    }

    /// Whether `key` syncs: allowed and not excepted. The browser script
    /// applies the very same rule to the lists the page carries.
    pub fn is_synced(&self, key: &str) -> bool {
        self.is_synced_local(key) || self.is_synced_session(key)
    }

    fn denied(&self, key: &str) -> bool {
        self.deny_exact.contains(key)
            || self.deny_prefix.iter().any(|p| key.starts_with(p.as_str()))
    }

    /// Whether `key` of `localStorage` syncs.
    pub fn is_synced_local(&self, key: &str) -> bool {
        (self.allow_exact.contains(key)
            || self
                .allow_prefix
                .iter()
                .any(|p| key.starts_with(p.as_str())))
            && !self.denied(key)
    }

    /// Whether `key` of `sessionStorage` syncs. A key both areas declare is
    /// `localStorage`'s: one key, one area.
    pub fn is_synced_session(&self, key: &str) -> bool {
        (self.session_exact.contains(key)
            || self
                .session_prefix
                .iter()
                .any(|p| key.starts_with(p.as_str())))
            && !self.denied(key)
            && !self.is_synced_local(key)
    }
}

// ---- the rules around the port -------------------------------------------

/// The preferences of a service: a store, the declaration and the limits.
/// Cheap to clone. This is what the routes and the page injection use; code
/// that wants another database writes a [`PrefStore`] and passes it to
/// [`Prefs::new`].
#[derive(Clone)]
pub struct Prefs {
    store: Arc<dyn PrefStore>,
    keys: Arc<BrowserKeys>,
    limits: PrefLimits,
    /// Values that must never be stored: the login token and the secret key.
    forbidden_values: Arc<Vec<String>>,
}

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
