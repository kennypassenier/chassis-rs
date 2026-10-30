//! User preferences in the database (3.12.0): a port, two adapters and the
//! rules around them.
//!
//! Kenny, 2026-10-21: app state belongs in the database, not the browser,
//! unless the webapp needs it to work. This module is the server half. The
//! storage is a **port** ([`PrefStore`]) with a sqlite adapter (the
//! `chassis_prefs` table of the APP database, so the Storage page's
//! targeted delete reaches it, and never the kit file) and an in-memory
//! adapter for tests. Another database later is one more adapter.
//!
//! A preference belongs to a **scope**: the login identity (see
//! `docs/STORAGE_DESIGN.md`, "Scope"). The port takes the scope as a plain
//! string on every call, so a future multi-user kit passes another one and
//! nothing else changes. Today the dashboard has one admin, whose scope is
//! [`ADMIN_SCOPE`], whether the admin signed in with the token or a passkey
//! and from whichever device.
//!
//! What may be stored is decided by the app: `BrowserKeys` lists the exact
//! `localStorage` keys and key prefixes that sync, and the exceptions that do
//! not. The kit never syncs a key it was not told to, refuses a declaration
//! or a key that names a secret, and refuses a value that looks like one.

use std::collections::BTreeMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Mutex;

use serde::Serialize;

use super::app_db::AppDb;
use crate::core::error::Error;

/// The scope of the dashboard's one admin. The login identity, not the
/// device and not the passkey: the same preferences follow the admin to
/// every browser.
pub const ADMIN_SCOPE: &str = "admin";

/// Created next to the app's own schema, outside its numbered migrations
/// (like `chassis_meta`), so the app's list stays its own.
pub(crate) const PREFS_DDL: &str = "CREATE TABLE IF NOT EXISTS chassis_prefs (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (scope, key)
) STRICT, WITHOUT ROWID;";

/// What an async method of the port returns: boxed so the trait stays
/// object-safe (`Arc<dyn PrefStore>`) without another dependency.
pub type PrefFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Error>> + Send + 'a>>;

/// How much one scope may hold.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[non_exhaustive]
pub struct Quota {
    /// Largest sum of key and value bytes of one scope.
    pub max_scope_bytes: u64,
    /// Most keys one scope may hold.
    pub max_keys: u64,
}

/// What a `set` did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum SetOutcome {
    Stored,
    /// Nothing was written: the scope would pass its quota.
    ScopeFull {
        used_bytes: u64,
        keys: u64,
    },
}

/// The port: where preferences live. Every method takes the scope.
///
/// `set` carries the quota because only the store can check it in the same
/// atomic step as the write; two simultaneous sets must not both fit.
pub trait PrefStore: Send + Sync {
    fn get<'a>(&'a self, scope: &'a str, key: &'a str) -> PrefFuture<'a, Option<String>>;
    fn set<'a>(
        &'a self,
        scope: &'a str,
        key: &'a str,
        value: &'a str,
        quota: Quota,
    ) -> PrefFuture<'a, SetOutcome>;
    /// Whether the key existed.
    fn remove<'a>(&'a self, scope: &'a str, key: &'a str) -> PrefFuture<'a, bool>;
    /// Every `(key, value)` of the scope whose key starts with `prefix`,
    /// sorted by key. An empty prefix lists the scope.
    fn list<'a>(&'a self, scope: &'a str, prefix: &'a str)
    -> PrefFuture<'a, Vec<(String, String)>>;
}

pub(crate) fn entry_bytes(key: &str, value: &str) -> u64 {
    (key.len() + value.len()) as u64
}

// ---- in memory ------------------------------------------------------------

/// The in-memory adapter, for tests of code that takes a [`PrefStore`].
#[derive(Default)]
pub struct MemoryPrefStore {
    rows: Mutex<BTreeMap<(String, String), String>>,
}

impl MemoryPrefStore {
    pub fn new() -> Self {
        Self::default()
    }
}

/// The sqlite adapter: the `chassis_prefs` table of the app database.
#[derive(Clone)]
pub struct SqlitePrefStore {
    db: AppDb,
}

impl SqlitePrefStore {
    /// Over the app database (which creates the table when it opens).
    pub fn new(db: AppDb) -> Self {
        SqlitePrefStore { db }
    }
}

mod memory_store;
mod sqlite_store;
#[cfg(test)]
mod tests;
