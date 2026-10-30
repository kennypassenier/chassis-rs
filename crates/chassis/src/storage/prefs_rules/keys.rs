//! Declaring and asking the browser-key allow-list: the builder methods a
//! project chains and the questions the routes ask (is this key synced, and
//! where).

use super::{BrowserKeys, PrefLimits};

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
