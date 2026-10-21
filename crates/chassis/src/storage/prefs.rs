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

use rusqlite::params;
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

impl PrefStore for MemoryPrefStore {
    fn get<'a>(&'a self, scope: &'a str, key: &'a str) -> PrefFuture<'a, Option<String>> {
        Box::pin(async move {
            Ok(self
                .rows
                .lock()
                .expect("prefs lock")
                .get(&(scope.to_string(), key.to_string()))
                .cloned())
        })
    }

    fn set<'a>(
        &'a self,
        scope: &'a str,
        key: &'a str,
        value: &'a str,
        quota: Quota,
    ) -> PrefFuture<'a, SetOutcome> {
        Box::pin(async move {
            let mut rows = self.rows.lock().expect("prefs lock");
            let id = (scope.to_string(), key.to_string());
            let (mut used, mut keys) = (0u64, 0u64);
            for ((s, k), v) in rows.iter() {
                if s == scope && k != key {
                    used += entry_bytes(k, v);
                    keys += 1;
                }
            }
            if used + entry_bytes(key, value) > quota.max_scope_bytes || keys + 1 > quota.max_keys {
                return Ok(SetOutcome::ScopeFull {
                    used_bytes: used,
                    keys,
                });
            }
            rows.insert(id, value.to_string());
            Ok(SetOutcome::Stored)
        })
    }

    fn remove<'a>(&'a self, scope: &'a str, key: &'a str) -> PrefFuture<'a, bool> {
        Box::pin(async move {
            Ok(self
                .rows
                .lock()
                .expect("prefs lock")
                .remove(&(scope.to_string(), key.to_string()))
                .is_some())
        })
    }

    fn list<'a>(
        &'a self,
        scope: &'a str,
        prefix: &'a str,
    ) -> PrefFuture<'a, Vec<(String, String)>> {
        Box::pin(async move {
            Ok(self
                .rows
                .lock()
                .expect("prefs lock")
                .iter()
                .filter(|((s, k), _)| s == scope && k.starts_with(prefix))
                .map(|((_, k), v)| (k.clone(), v.clone()))
                .collect())
        })
    }
}

// ---- sqlite ---------------------------------------------------------------

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

fn now_secs() -> i64 {
    crate::shell::time::now_epoch() as i64
}

impl PrefStore for SqlitePrefStore {
    fn get<'a>(&'a self, scope: &'a str, key: &'a str) -> PrefFuture<'a, Option<String>> {
        let (scope, key) = (scope.to_string(), key.to_string());
        Box::pin(async move {
            self.db
                .read(move |c| {
                    use rusqlite::OptionalExtension;
                    Ok(c.query_row(
                        "SELECT value FROM chassis_prefs WHERE scope = ?1 AND key = ?2",
                        params![scope, key],
                        |r| r.get(0),
                    )
                    .optional()?)
                })
                .await
        })
    }

    fn set<'a>(
        &'a self,
        scope: &'a str,
        key: &'a str,
        value: &'a str,
        quota: Quota,
    ) -> PrefFuture<'a, SetOutcome> {
        let (scope, key, value) = (scope.to_string(), key.to_string(), value.to_string());
        Box::pin(async move {
            self.db
                .write(move |tx| {
                    let (used, keys): (i64, i64) = tx.query_row(
                        "SELECT COALESCE(SUM(length(CAST(key AS BLOB)) + length(CAST(value AS BLOB))), 0), COUNT(*) \
                         FROM chassis_prefs WHERE scope = ?1 AND key <> ?2",
                        params![scope, key],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )?;
                    let (used, keys) = (used.max(0) as u64, keys.max(0) as u64);
                    if used + entry_bytes(&key, &value) > quota.max_scope_bytes
                        || keys + 1 > quota.max_keys
                    {
                        return Ok(SetOutcome::ScopeFull {
                            used_bytes: used,
                            keys,
                        });
                    }
                    tx.execute(
                        "INSERT INTO chassis_prefs (scope, key, value, updated_at) VALUES (?1, ?2, ?3, ?4) \
                         ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                        params![scope, key, value, now_secs()],
                    )?;
                    Ok(SetOutcome::Stored)
                })
                .await
        })
    }

    fn remove<'a>(&'a self, scope: &'a str, key: &'a str) -> PrefFuture<'a, bool> {
        let (scope, key) = (scope.to_string(), key.to_string());
        Box::pin(async move {
            self.db
                .write(move |tx| {
                    Ok(tx.execute(
                        "DELETE FROM chassis_prefs WHERE scope = ?1 AND key = ?2",
                        params![scope, key],
                    )? > 0)
                })
                .await
        })
    }

    fn list<'a>(
        &'a self,
        scope: &'a str,
        prefix: &'a str,
    ) -> PrefFuture<'a, Vec<(String, String)>> {
        let (scope, prefix) = (scope.to_string(), prefix.to_string());
        Box::pin(async move {
            self.db
                .read(move |c| {
                    // `substr` counts characters on both sides; no LIKE, so
                    // `%` and `_` in a prefix mean themselves.
                    let mut stmt = c.prepare(
                        "SELECT key, value FROM chassis_prefs \
                         WHERE scope = ?1 AND substr(key, 1, length(?2)) = ?2 ORDER BY key",
                    )?;
                    let rows = stmt
                        .query_map(params![scope, prefix], |r| Ok((r.get(0)?, r.get(1)?)))?
                        .collect::<Result<Vec<_>, _>>()?;
                    Ok(rows)
                })
                .await
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    /// The port behaves the same behind both adapters: scopes apart, a
    /// prefix listing, the quota enforced in the store's own step.
    async fn port_contract(store: Arc<dyn PrefStore>) {
        let q = Quota {
            max_scope_bytes: 40,
            max_keys: 3,
        };
        assert_eq!(store.get("admin", "a").await.unwrap(), None);
        assert_eq!(
            store.set("admin", "a", "1", q).await.unwrap(),
            SetOutcome::Stored
        );
        store.set("admin", "ab", "2", q).await.unwrap();
        store.set("other", "a", "x", q).await.unwrap();
        assert_eq!(store.get("admin", "a").await.unwrap().as_deref(), Some("1"));
        assert_eq!(store.get("other", "a").await.unwrap().as_deref(), Some("x"));
        // Overwrite keeps one row.
        store.set("admin", "a", "11", q).await.unwrap();
        let all = store.list("admin", "").await.unwrap();
        assert_eq!(
            all,
            vec![("a".into(), "11".into()), ("ab".into(), "2".into())]
        );
        assert_eq!(store.list("admin", "ab").await.unwrap().len(), 1);
        // `%` and `_` in a prefix mean themselves.
        store.set("admin", "p_q", "1", q).await.unwrap();
        assert_eq!(store.list("admin", "p_").await.unwrap().len(), 1);
        assert_eq!(store.list("admin", "p%").await.unwrap().len(), 0);
        // Key count: three held, a fourth is refused, the scope of another
        // login is unaffected.
        assert!(matches!(
            store.set("admin", "d", "1", q).await.unwrap(),
            SetOutcome::ScopeFull { keys: 3, .. }
        ));
        store.set("other", "b", "1", q).await.unwrap();
        // Bytes: replacing a value counts the room it frees.
        let q2 = Quota {
            max_scope_bytes: 8,
            max_keys: 9,
        };
        assert!(matches!(
            store.set("tiny", "k", "123456789", q2).await.unwrap(),
            SetOutcome::ScopeFull { .. }
        ));
        store.set("tiny", "k", "1234567", q2).await.unwrap();
        store.set("tiny", "k", "123456", q2).await.unwrap();
        assert!(store.remove("admin", "a").await.unwrap());
        assert!(!store.remove("admin", "a").await.unwrap());
        assert_eq!(store.get("admin", "a").await.unwrap(), None);
    }

    #[tokio::test]
    async fn both_adapters_keep_the_port_contract() {
        port_contract(Arc::new(MemoryPrefStore::new())).await;
        let db =
            AppDb::open_in_memory(super::super::AppDbSpec::new(Vec::new()), Vec::new()).unwrap();
        port_contract(Arc::new(SqlitePrefStore::new(db))).await;
    }

    /// Multi-byte keys and values count in bytes in both adapters.
    #[tokio::test]
    async fn the_quota_counts_bytes_not_characters() {
        let q = Quota {
            max_scope_bytes: 8,
            max_keys: 9,
        };
        let db =
            AppDb::open_in_memory(super::super::AppDbSpec::new(Vec::new()), Vec::new()).unwrap();
        let sqlite = SqlitePrefStore::new(db);
        let mem = MemoryPrefStore::new();
        // "é" is 2 bytes: key a (1) + value of 3 chars (6 bytes) = 7 fits; 4 chars = 9 does not.
        for store in [&sqlite as &dyn PrefStore, &mem] {
            assert_eq!(
                store.set("s", "a", "ééé", q).await.unwrap(),
                SetOutcome::Stored
            );
            assert!(matches!(
                store.set("s", "a", "éééé", q).await.unwrap(),
                SetOutcome::ScopeFull { .. }
            ));
        }
    }
}
