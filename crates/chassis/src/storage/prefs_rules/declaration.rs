//! Checking a [`BrowserKeys`] declaration at start and rendering it for the
//! page. Its own module because it runs once and shares nothing with the
//! per-request rules in `Prefs`.

use serde_json::{Value as Json, json};

use super::BrowserKeys;
use super::secrets::{key_ok, looks_secret_name};
use crate::core::error::Error;

impl BrowserKeys {
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
        self.validate_names()?;
        let l = self.code_limits();
        if l.max_value_bytes == 0 || l.max_scope_bytes < l.max_value_bytes || l.max_keys == 0 {
            return Err(Error::config(
                "the preference limits do not hold together",
                "a value limit above 0, a scope limit at least as large, and room for one key",
            ));
        }
        Ok(())
    }

    /// Every declared key or prefix must be non-empty, usable as a key and
    /// not name a secret.
    fn validate_names(&self) -> Result<(), Error> {
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
