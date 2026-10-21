//! The rules around the preference port (3.12.0): which browser keys sync
//! ([`BrowserKeys`]), the limits, the refusal of anything that looks like a
//! secret, and the [`Prefs`] service the routes and the page injection use.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use serde::Serialize;
use serde_json::{Value as Json, json};

use super::prefs::{PrefStore, Quota, SetOutcome};
use crate::core::error::Error;

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

/// Words that mark a key as a secret's. A declaration naming one is refused
/// at start; so is a request key that does.
const SECRET_WORDS: [&str; 12] = [
    "token",
    "secret",
    "password",
    "passwd",
    "passphrase",
    "credential",
    "apikey",
    "api-key",
    "api_key",
    "bearer",
    "privatekey",
    "private-key",
];

pub(crate) fn looks_secret_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    SECRET_WORDS.iter().any(|w| lower.contains(w))
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

    /// Checked at start and by `--check`.
    pub(crate) fn validate(&self) -> Result<(), Error> {
        if self.allow_exact.is_empty()
            && self.allow_prefix.is_empty()
            && self.session_exact.is_empty()
            && self.session_prefix.is_empty()
        {
            return Err(Error::config(
                "App::sync_browser_keys declares no key",
                "name at least one exact key or prefix with BrowserKeys::exact / ::prefix",
            ));
        }
        for p in self
            .allow_exact
            .iter()
            .chain(&self.allow_prefix)
            .chain(&self.session_exact)
            .chain(&self.session_prefix)
        {
            if p.is_empty() {
                return Err(Error::config(
                    "App::sync_browser_keys declares an empty key or prefix, which would sync every key",
                    "declare the prefix your app uses, such as \"myapp.\"",
                ));
            }
            if !key_ok(p) {
                return Err(Error::config(
                    format!("the declared key or prefix `{p}` cannot be a key"),
                    "at most 256 bytes, no control characters, not `.` or `..`",
                ));
            }
            if looks_secret_name(p) {
                return Err(Error::config(
                    format!("the declared key or prefix `{p}` looks like it names a secret"),
                    "secrets must never sync: they would sit in plain text in the app database and in every page; keep them out of localStorage altogether, or rename the key if it holds no secret",
                ));
            }
        }
        let l = self.code_limits();
        if l.max_value_bytes == 0 || l.max_scope_bytes < l.max_value_bytes || l.max_keys == 0 {
            return Err(Error::config(
                "the preference limits do not hold together",
                "a value limit above 0, a scope limit at least as large, and room for one key",
            ));
        }
        Ok(())
    }

    /// The declaration as the page carries it.
    pub(crate) fn to_json(&self) -> Json {
        json!({
            "exact": self.allow_exact,
            "prefix": self.allow_prefix,
            "session_exact": self.session_exact,
            "session_prefix": self.session_prefix,
            "except_exact": self.deny_exact,
            "except_prefix": self.deny_prefix,
        })
    }
}

/// What makes a key unusable, and nothing else (Kenny, 2026-10-21: any app
/// may give any setting any name): empty, longer than the limit, a control
/// character, or `.` / `..` whole, which a URL path cannot carry. Colons,
/// slashes, spaces, `%`, `?`, `#` and non-ASCII are all fine; the browser
/// script encodes the key into the path.
fn key_ok(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= PrefLimits::MAX_KEY_BYTES
        && !key.chars().any(char::is_control)
        && key != "."
        && key != ".."
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

/// A value that is almost certainly a secret: a PEM block, a JWT, a bearer
/// credential, or the service's own login token or key. A heuristic with a
/// short list, not a scanner: the real rule is "never declare a secret".
fn looks_like_secret(value: &str, own: &[String]) -> Option<&'static str> {
    if value.contains("-----BEGIN ") {
        return Some("a PEM key or certificate");
    }
    if own.iter().any(|s| value.contains(s.as_str())) {
        return Some("this service's own login token or key");
    }
    if let Some(i) = value.to_ascii_lowercase().find("bearer ") {
        let rest = &value[i + 7..];
        if rest
            .bytes()
            .take_while(|b| !b.is_ascii_whitespace() && *b != b'"')
            .count()
            >= 16
        {
            return Some("a bearer credential");
        }
    }
    // A form draft (kp-themes' unsaved bar) is a JSON object of field names;
    // a field named like a secret is never stored, whatever kp excluded.
    if let Ok(Json::Object(fields)) = serde_json::from_str::<Json>(value)
        && fields.keys().any(|k| looks_secret_name(k))
    {
        return Some("a form draft with a secret field (password, token, key)");
    }
    let b = value.as_bytes();
    let mut from = 0;
    while let Some(off) = value[from..].find("eyJ") {
        let start = from + off;
        let end = start
            + b[start..]
                .iter()
                .take_while(|c| c.is_ascii_alphanumeric() || b"-_.".contains(c))
                .count();
        let token = &value[start..end];
        let parts: Vec<&str> = token.split('.').collect();
        if token.len() >= 30 && parts.len() == 3 && parts[0].len() > 8 && parts[1].len() > 8 {
            return Some("a signed token (JWT)");
        }
        from = start + 3;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::MemoryPrefStore;

    fn homelab() -> BrowserKeys {
        BrowserKeys::new()
            .prefix("homelab.")
            .prefix("homelab-")
            .prefix("nx-sort:")
            .prefix("kp-remember:")
            .except_exact("homelab.theme-follow-system")
            .except_exact("homelab.theme-light")
            .except_exact("homelab.theme-dark")
    }

    /// Homelab's declaration (coordinator, 2026-10-21): the allow-list
    /// carries its prefixes, the pre-login theme keys stay local, a running
    /// flow marker syncs, and nothing undeclared does.
    #[test]
    fn homelabs_allow_list_and_exceptions_decide_which_keys_sync() {
        let k = homelab();
        for yes in [
            "homelab.log-levels",
            "homelab-toured",
            "homelab-update-jobs",
            "nx-sort:stacks",
            "kp-remember:datatable:status:sort",
            "homelab.stacks.view",
        ] {
            assert!(k.is_synced(yes), "{yes} syncs");
        }
        for no in [
            "homelab.theme-follow-system",
            "homelab.theme-light",
            "homelab.theme-dark",
            "theme",
            "homelab",
            "other.key",
            "kp:remember",
        ] {
            assert!(!k.is_synced(no), "{no} stays in the browser");
        }
        // The exception beats the allow-list, including for a prefix.
        let k = homelab().except_prefix("homelab.stacks.");
        assert!(!k.is_synced("homelab.stacks.view"));
        assert!(k.is_synced("homelab.map.deplist"));
        k.validate().unwrap();
    }

    /// The rule table both sides share: the browser script's test reads the
    /// same file, so server and script cannot drift (Kenny's locking-test
    /// rule). Homelab's declaration, session draft prefix included.
    #[test]
    fn the_shared_fixture_decides_the_same_on_the_server() {
        let fx: Json =
            serde_json::from_str(include_str!("../../tests/fixtures/sync_rules.json")).unwrap();
        let list = |name: &str| -> Vec<String> {
            fx["synced"][name]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_str().unwrap().to_string())
                .collect()
        };
        let mut k = BrowserKeys::new();
        for v in list("exact") {
            k = k.exact(&v);
        }
        for v in list("prefix") {
            k = k.prefix(&v);
        }
        for v in list("session_exact") {
            k = k.session_exact(&v);
        }
        for v in list("session_prefix") {
            k = k.session_prefix(&v);
        }
        for v in list("except_exact") {
            k = k.except_exact(&v);
        }
        for v in list("except_prefix") {
            k = k.except_prefix(&v);
        }
        k.validate().unwrap();
        assert_eq!(
            serde_json::to_value(k.to_json()).unwrap()["session_prefix"],
            fx["synced"]["session_prefix"]
        );
        for c in fx["cases"].as_array().unwrap() {
            let key = c["key"].as_str().unwrap();
            assert_eq!(k.is_synced_local(key), c["local"], "{key} local");
            assert_eq!(k.is_synced_session(key), c["session"], "{key} session");
        }
    }

    #[tokio::test]
    async fn a_form_draft_with_a_password_field_is_never_stored() {
        let p = Prefs::new(
            Arc::new(MemoryPrefStore::new()),
            BrowserKeys::new().session_prefix("kp-unsaved:"),
            PrefLimits::default(),
        );
        let key = "kp-unsaved:/settings:settings";
        p.put("admin", key, r#"{"port":"8081","name":"x"}"#)
            .await
            .unwrap();
        for bad in [
            r#"{"port":"1","password":"hunter2"}"#,
            r#"{"admin_token":"abc"}"#,
            r#"{"api_key":"abc"}"#,
        ] {
            assert!(p.put("admin", key, bad).await.is_err(), "{bad}");
        }
    }

    #[test]
    fn a_declaration_that_names_a_secret_or_everything_is_refused() {
        for bad in ["session-token", "app.secret.", "x.password", "API_KEY"] {
            assert!(
                BrowserKeys::new().prefix(bad).validate().is_err(),
                "{bad} is refused"
            );
        }
        assert!(BrowserKeys::new().validate().is_err(), "nothing declared");
        assert!(
            BrowserKeys::new().prefix("").validate().is_err(),
            "the empty prefix would sync everything"
        );
        assert!(BrowserKeys::new().prefix("a\nb").validate().is_err());
        assert!(BrowserKeys::new().prefix("..").validate().is_err());
        assert!(
            BrowserKeys::new()
                .prefix(&"k".repeat(257))
                .validate()
                .is_err(),
            "over the length limit"
        );
        // Any other name is fine: spaces, slashes, colons, non-ASCII.
        BrowserKeys::new()
            .prefix("my app/ключ ")
            .exact("nx-sort:Mijn tabel #1?")
            .validate()
            .unwrap();
        assert!(
            BrowserKeys::new()
                .prefix("a.")
                .max_value_bytes(100)
                .max_scope_bytes(10)
                .validate()
                .is_err()
        );
        BrowserKeys::new().prefix("a.").validate().unwrap();
    }

    fn prefs(max_value: u64, max_scope: u64, max_keys: u64) -> Prefs {
        Prefs::new(
            Arc::new(MemoryPrefStore::new()),
            BrowserKeys::new().prefix("app."),
            PrefLimits {
                max_value_bytes: max_value,
                max_scope_bytes: max_scope,
                max_keys,
            },
        )
    }

    #[tokio::test]
    async fn the_rules_refuse_what_was_not_declared_and_what_looks_secret() {
        let p = prefs(64, 1024, 10).forbid_values(vec!["hunter2-hunter2".into()]);
        p.put("admin", "app.a", "1").await.unwrap();
        assert!(p.put("admin", "other", "1").await.is_err(), "undeclared");
        assert!(p.put("admin", "app.x\ty", "1").await.is_err(), "control");
        p.put("admin", "app.x y/é:%?#", "1").await.unwrap();
        assert!(p.put("admin", "app.token", "1").await.is_err(), "name");
        assert!(p.put("admin", "app.v", &"x".repeat(65)).await.is_err());
        for secret in [
            "-----BEGIN PRIVATE KEY-----",
            "Bearer abcdefghijklmnopqrstuvwxyz",
            "{\"t\":\"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk\"}",
            "pw hunter2-hunter2 here",
        ] {
            assert!(p.put("admin", "app.v", secret).await.is_err(), "{secret}");
        }
        // Ordinary JSON of a preference passes.
        p.put("admin", "app.v", r#"{"sort":[["name","asc"]],"page":2}"#)
            .await
            .unwrap();
        assert_eq!(p.list("admin", "").await.unwrap().len(), 3);
    }
}
