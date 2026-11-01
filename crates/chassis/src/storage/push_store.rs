//! Web Push persistence (habits-push-1, `docs/PUSH_DESIGN.md`): the browsers
//! that subscribed, and the app's sealed VAPID key.
//!
//! One table in the kit file (`<name>-kit.db`). A subscription is identified
//! by its endpoint; subscribing again from the same browser renews the keys
//! in place. The table is capped (`push_max_subscriptions`): a NEW endpoint
//! past the cap is refused, because silently evicting a working browser to
//! make room would be worse than saying no. A subscription a push service
//! reports as gone is deleted by the sender; one that merely failed keeps its
//! row, with the last error, so the owner can see it.
//!
//! This module is only storage. Validation of what a browser sends is
//! `push/subscription.rs`; the sealing of the key is `push/mount.rs`.

// Without the `push` feature only the schema step is used.
#![cfg_attr(not(feature = "push"), allow(dead_code))]

use rusqlite::OptionalExtension;

use super::db::{Db, Migration, meta_get, meta_set};
use crate::core::error::Error;

/// The `chassis_meta` row holding the sealed PKCS#8 of the VAPID key.
const VAPID_ROW: &str = "push_vapid_key";

/// The schema step. Part of `kit_migrations()` whether or not the `push`
/// feature is compiled in, so every build agrees on the kit file's version.
pub(crate) fn migration() -> Migration {
    Migration::sql(
        "CREATE TABLE kit_push_subscriptions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint        TEXT NOT NULL UNIQUE,
            p256dh          TEXT NOT NULL,
            auth            TEXT NOT NULL,
            created_at      INTEGER NOT NULL,
            last_success_at INTEGER,
            last_error      TEXT,
            last_error_at   INTEGER
         ) STRICT;",
    )
}

/// One subscribed browser. `p256dh` and `auth` are base64url text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Stored {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
    pub created_at: i64,
    pub last_success_at: Option<i64>,
    pub last_error: Option<String>,
}

/// What [`PushStore::upsert`] did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Upsert {
    Created,
    Renewed,
}

#[derive(Clone)]
pub(crate) struct PushStore {
    db: Db,
    cap: usize,
}

impl PushStore {
    pub(crate) fn new(db: Db, cap: usize) -> Self {
        PushStore {
            db,
            cap: cap.max(1),
        }
    }

    /// Store a subscription, or renew the keys of a known endpoint (which
    /// also clears its last error). A new endpoint past the cap is refused.
    pub(crate) fn upsert(
        &self,
        endpoint: &str,
        p256dh: &str,
        auth: &str,
        now: i64,
    ) -> Result<Upsert, Error> {
        let cap = self.cap as i64;
        self.db.write_blocking(|tx| {
            let known: i64 = tx.query_row(
                "SELECT COUNT(*) FROM kit_push_subscriptions WHERE endpoint = ?1",
                [endpoint],
                |r| r.get(0),
            )?;
            if known == 0 {
                let n: i64 =
                    tx.query_row("SELECT COUNT(*) FROM kit_push_subscriptions", [], |r| r.get(0))?;
                if n >= cap {
                    return Err(Error::invalid(
                        format!("{n} browsers are already subscribed; the limit is {cap}"),
                        "unsubscribe a browser that is no longer used, or raise push_max_subscriptions",
                    ));
                }
            }
            tx.execute(
                "INSERT INTO kit_push_subscriptions (endpoint, p256dh, auth, created_at) \
                 VALUES (?1, ?2, ?3, ?4) \
                 ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, \
                 auth = excluded.auth, last_error = NULL, last_error_at = NULL",
                rusqlite::params![endpoint, p256dh, auth, now],
            )?;
            Ok(if known == 0 { Upsert::Created } else { Upsert::Renewed })
        })
    }

    /// Delete by endpoint; whether a row existed.
    pub(crate) fn remove(&self, endpoint: &str) -> Result<bool, Error> {
        self.db.write_blocking(|tx| {
            let n = tx.execute(
                "DELETE FROM kit_push_subscriptions WHERE endpoint = ?1",
                [endpoint],
            )?;
            Ok(n > 0)
        })
    }

    /// Every subscription, oldest first.
    pub(crate) fn all(&self) -> Result<Vec<Stored>, Error> {
        self.db.read_blocking(|c| {
            let mut stmt = c.prepare(
                "SELECT endpoint, p256dh, auth, created_at, last_success_at, last_error \
                 FROM kit_push_subscriptions ORDER BY id ASC",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok(Stored {
                    endpoint: r.get(0)?,
                    p256dh: r.get(1)?,
                    auth: r.get(2)?,
                    created_at: r.get(3)?,
                    last_success_at: r.get(4)?,
                    last_error: r.get(5)?,
                })
            })?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        })
    }

    /// A push service accepted a message for this endpoint.
    pub(crate) fn record_success(&self, endpoint: &str, now: i64) -> Result<(), Error> {
        self.db.write_blocking(|tx| {
            tx.execute(
                "UPDATE kit_push_subscriptions SET last_success_at = ?2, \
                 last_error = NULL, last_error_at = NULL WHERE endpoint = ?1",
                rusqlite::params![endpoint, now],
            )?;
            Ok(())
        })
    }

    /// A delivery failed; `message` is a sentence without the endpoint in it.
    pub(crate) fn record_error(
        &self,
        endpoint: &str,
        message: &str,
        now: i64,
    ) -> Result<(), Error> {
        self.db.write_blocking(|tx| {
            tx.execute(
                "UPDATE kit_push_subscriptions SET last_error = ?2, last_error_at = ?3 \
                 WHERE endpoint = ?1",
                rusqlite::params![endpoint, message, now],
            )?;
            Ok(())
        })
    }

    /// The sealed VAPID key, if one was made already.
    pub(crate) fn vapid_sealed(&self) -> Result<Option<String>, Error> {
        self.db.read_blocking(|c| meta_get(c, VAPID_ROW))
    }

    /// Store the sealed VAPID key, unless a concurrent start stored one
    /// first; returns the row that is now authoritative.
    pub(crate) fn set_vapid_sealed(&self, sealed: &str) -> Result<String, Error> {
        self.db.write_blocking(|tx| {
            let existing: Option<String> = tx
                .query_row(
                    "SELECT value FROM chassis_meta WHERE key = ?1",
                    [VAPID_ROW],
                    |r| r.get(0),
                )
                .optional()?;
            if let Some(winner) = existing {
                return Ok(winner);
            }
            meta_set(tx, VAPID_ROW, sealed)?;
            Ok(sealed.to_string())
        })
    }
}

#[cfg(test)]
mod tests;
