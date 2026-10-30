//! The outbox: notification messages that wait on disk until a target has
//! accepted them (3.15.0, `docs/NOTIFY_DESIGN.md`).
//!
//! One table in the kit file (`<name>-kit.db`). A message is written before
//! anything is sent, so it survives a restart; a delivered message is
//! deleted at once (the table holds only what still has to go out). The
//! table has a cap: past it the OLDEST waiting messages are dropped and
//! counted, because the newest news is the most useful when a target has
//! been away for long.
//!
//! This module is only the queue. Which address a message goes to, the
//! retries and the last error are the shell's and `notify_meta`'s business.

// Without the `notify` feature only the schema step is used.
#![cfg_attr(not(feature = "notify"), allow(dead_code))]

use super::db::{Db, Migration};
use crate::core::error::Error;

/// The schema step. Part of `kit_migrations()` whether or not the `notify`
/// feature is compiled in, so every build agrees on the kit file's version.
pub(crate) fn migration() -> Migration {
    Migration::sql(
        "CREATE TABLE kit_outbox (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at   INTEGER NOT NULL,
            kind         TEXT NOT NULL,
            body         TEXT NOT NULL,
            attempts     INTEGER NOT NULL DEFAULT 0,
            next_try_at  INTEGER NOT NULL DEFAULT 0,
            dedup_key    TEXT,
            dedup_window TEXT
         ) STRICT;
         CREATE INDEX kit_outbox_due ON kit_outbox (next_try_at, id);",
    )
}

/// One waiting message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Waiting {
    pub id: i64,
    pub created_at: i64,
    pub kind: String,
    pub body: String,
    pub attempts: i64,
    /// kyu's `Kyu-Dedup-Key` / `Kyu-Dedup-Window`, kept with the row so a
    /// retry after a restart sends the same key.
    pub dedup_key: Option<String>,
    pub dedup_window: Option<String>,
}

/// What is on disk now.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) struct Counts {
    pub waiting: u64,
    /// When the oldest waiting message was written (epoch seconds).
    pub oldest_at: Option<i64>,
}

#[derive(Clone)]
pub(crate) struct Outbox {
    db: Db,
    cap: usize,
}

impl Outbox {
    pub(crate) fn new(db: Db, cap: usize) -> Self {
        Outbox {
            db,
            cap: cap.max(1),
        }
    }

    /// Write one message. Returns how many OLDER messages the cap pushed out
    /// (zero almost always).
    pub(crate) fn enqueue(
        &self,
        kind: &str,
        body: &str,
        dedup: Option<(&str, Option<&str>)>,
        now: i64,
    ) -> Result<u64, Error> {
        let cap = self.cap as i64;
        self.db.write_blocking(|tx| {
            tx.execute(
                "INSERT INTO kit_outbox (created_at, kind, body, dedup_key, dedup_window) \
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![now, kind, body, dedup.map(|d| d.0), dedup.and_then(|d| d.1)],
            )?;
            let n: i64 = tx.query_row("SELECT COUNT(*) FROM kit_outbox", [], |r| r.get(0))?;
            if n <= cap {
                return Ok(0);
            }
            let over = n - cap;
            let dropped = tx.execute(
                "DELETE FROM kit_outbox WHERE id IN \
                 (SELECT id FROM kit_outbox ORDER BY id ASC LIMIT ?1)",
                [over],
            )?;
            Ok(dropped as u64)
        })
    }

    /// The oldest message whose retry time has come.
    pub(crate) fn next_due(&self, now: i64) -> Result<Option<Waiting>, Error> {
        use rusqlite::OptionalExtension;
        self.db.read_blocking(|c| {
            Ok(c.query_row(
                "SELECT id, created_at, kind, body, attempts, dedup_key, dedup_window FROM kit_outbox \
                 WHERE next_try_at <= ?1 ORDER BY id ASC LIMIT 1",
                [now],
                |r| {
                    Ok(Waiting {
                        id: r.get(0)?,
                        created_at: r.get(1)?,
                        kind: r.get(2)?,
                        body: r.get(3)?,
                        attempts: r.get(4)?,
                        dedup_key: r.get(5)?,
                        dedup_window: r.get(6)?,
                    })
                },
            )
            .optional()?)
        })
    }

    /// A target accepted it: the row is deleted.
    pub(crate) fn delivered(&self, id: i64) -> Result<(), Error> {
        self.db.write_blocking(|tx| {
            tx.execute("DELETE FROM kit_outbox WHERE id = ?1", [id])?;
            Ok(())
        })
    }

    /// No target took it this round: count the attempt and say when to try
    /// again.
    pub(crate) fn failed(&self, id: i64, retry_at: i64) -> Result<(), Error> {
        self.db.write_blocking(|tx| {
            tx.execute(
                "UPDATE kit_outbox SET attempts = attempts + 1, next_try_at = ?2 WHERE id = ?1",
                rusqlite::params![id, retry_at],
            )?;
            Ok(())
        })
    }

    /// Make every waiting message due now (a target was just changed, so
    /// waiting out the old backoff would be pointless).
    pub(crate) fn due_now(&self) -> Result<(), Error> {
        self.db.write_blocking(|tx| {
            tx.execute("UPDATE kit_outbox SET next_try_at = 0", [])?;
            Ok(())
        })
    }

    pub(crate) fn counts(&self) -> Result<Counts, Error> {
        self.db.read_blocking(|c| {
            let (n, oldest): (i64, Option<i64>) = c.query_row(
                "SELECT COUNT(*), MIN(created_at) FROM kit_outbox",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            Ok(Counts {
                waiting: n.max(0) as u64,
                oldest_at: oldest,
            })
        })
    }

    /// The earliest retry time among the waiting messages.
    pub(crate) fn earliest_retry(&self) -> Result<Option<i64>, Error> {
        self.db.read_blocking(|c| {
            Ok(c.query_row("SELECT MIN(next_try_at) FROM kit_outbox", [], |r| r.get(0))?)
        })
    }
}

#[cfg(test)]
mod tests;
