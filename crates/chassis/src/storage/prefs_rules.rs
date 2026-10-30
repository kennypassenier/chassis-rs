//! The rules around the preference port (3.12.0): which browser keys sync
//! ([`BrowserKeys`]), the limits, the refusal of anything that looks like a
//! secret, and the [`Prefs`] service the routes and the page injection use.

use std::collections::BTreeSet;
use std::sync::Arc;

use serde::Serialize;

use super::prefs::{PrefStore, Quota};

mod declaration;
mod keys;
mod secrets;
mod service;
#[cfg(test)]
mod tests;

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

impl Prefs {}
