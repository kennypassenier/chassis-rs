//! Using an open `Db`: the writer and reader entry points (blocking and async),
//! the write ticket every write takes, the last-failure note and the small
//! accessors.

use std::path::Path;
use std::time::{Duration, Instant};

use rusqlite::{Connection, Transaction, TransactionBehavior};

use super::{Db, WRITE_FAILURE_WINDOW, join, lock};
use crate::core::error::{Error, Kind};
use crate::shell::backup::{self, HELD_WRITE_LIMIT, WriteTicket};

impl Db {
    /// Change how long the write connection waits for a lock. The default
    /// is [`BUSY_TIMEOUT`]; a test of a refused checkpoint lowers it so it
    /// does not wait five seconds on the clock.
    pub fn set_busy_timeout(&self, wait: Duration) -> Result<(), Error> {
        lock(&self.inner.writer).busy_timeout(wait)?;
        Ok(())
    }

    /// The file, `None` for a memory database.
    pub fn path(&self) -> Option<&Path> {
        self.inner.path.as_deref()
    }

    /// The schema version after open (the number of migrations applied).
    pub fn schema_version(&self) -> usize {
        self.inner.schema
    }

    // ---- the synchronous core -------------------------------------------

    /// Run a read on a pooled read-only connection (or the writer, in
    /// memory). Blocks the calling thread: use [`Db::read`] from async code.
    pub fn read_blocking<T>(
        &self,
        f: impl FnOnce(&Connection) -> Result<T, Error>,
    ) -> Result<T, Error> {
        for r in &self.inner.readers {
            if let Ok(conn) = r.try_lock() {
                return f(&conn);
            }
        }
        if let Some(r) = self.inner.readers.first() {
            return f(&lock(r));
        }
        f(&lock(&self.inner.writer))
    }

    /// Run `f` in one `BEGIN IMMEDIATE` transaction, committing when it
    /// returns `Ok`, holding a write ticket throughout. Blocks the calling
    /// thread; a backup pause holds it for at most
    /// [`backup::HELD_WRITE_LIMIT`], then it fails with a retryable 503.
    ///
    /// Write tickets do not nest: do not call this (or [`Db::write`]) while
    /// the same task already holds a ticket from [`backup::writing`]. If a
    /// backup pause starts between the two, the inner call waits for a pause
    /// the outer ticket keeps from finishing, and fails after the limit.
    pub fn write_blocking<T>(
        &self,
        f: impl FnOnce(&Transaction) -> Result<T, Error>,
    ) -> Result<T, Error> {
        let ticket = backup::writing_blocking_within(HELD_WRITE_LIMIT)?;
        self.write_with_ticket(ticket, f)
    }

    fn write_with_ticket<T>(
        &self,
        ticket: WriteTicket,
        f: impl FnOnce(&Transaction) -> Result<T, Error>,
    ) -> Result<T, Error> {
        let mut conn = lock(&self.inner.writer);
        let out = (|| {
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let value = f(&tx)?;
            tx.commit()?;
            Ok(value)
        })();
        drop(conn);
        drop(ticket);
        self.note_write(&out);
        out
    }

    pub(super) fn note_write<T>(&self, out: &Result<T, Error>) {
        // A business refusal (Invalid, NotFound) is not a sick file.
        match out {
            Err(e) if matches!(e.kind, Kind::Dependency | Kind::Overloaded | Kind::Internal) => {
                *lock(&self.inner.last_failure) = Some((Instant::now(), e.message.clone()));
            }
            Ok(_) => *lock(&self.inner.last_failure) = None,
            Err(_) => {}
        }
    }

    /// The reason a write failed in the last minute and how long ago, if
    /// one did, so `/healthz` can say "3 s ago" instead of "within a minute".
    pub fn recent_write_failure_age(&self) -> Option<(String, Duration)> {
        lock(&self.inner.last_failure)
            .as_ref()
            .filter(|(at, _)| at.elapsed() < WRITE_FAILURE_WINDOW)
            .map(|(at, why)| (why.clone(), at.elapsed()))
    }

    /// The reason a write failed in the last minute, if one did.
    pub fn recent_write_failure(&self) -> Option<String> {
        lock(&self.inner.last_failure)
            .as_ref()
            .filter(|(at, _)| at.elapsed() < WRITE_FAILURE_WINDOW)
            .map(|(_, why)| why.clone())
    }

    // ---- the async API ---------------------------------------------------

    /// [`Db::read_blocking`] under `spawn_blocking`.
    pub async fn read<T, F>(&self, f: F) -> Result<T, Error>
    where
        T: Send + 'static,
        F: FnOnce(&Connection) -> Result<T, Error> + Send + 'static,
    {
        let db = self.clone();
        join(tokio::task::spawn_blocking(move || db.read_blocking(f)).await)
    }

    /// One write transaction under `spawn_blocking`. The ticket is taken
    /// first without blocking a runtime thread, so a paused backup holds
    /// the caller, not a worker.
    pub async fn write<T, F>(&self, f: F) -> Result<T, Error>
    where
        T: Send + 'static,
        F: FnOnce(&Transaction) -> Result<T, Error> + Send + 'static,
    {
        let ticket = backup::writing_within(HELD_WRITE_LIMIT).await?;
        let db = self.clone();
        join(tokio::task::spawn_blocking(move || db.write_with_ticket(ticket, f)).await)
    }

    /// Reclaim free pages (`VACUUM`). Runs outside a transaction, so it is
    /// not a [`Db::write`]; it takes a ticket itself and the caller must
    /// have refused it during a pause already.
    pub fn vacuum_blocking(&self) -> Result<(), Error> {
        let ticket = backup::writing_blocking_within(HELD_WRITE_LIMIT)?;
        let conn = lock(&self.inner.writer);
        let out = conn.execute_batch("VACUUM").map_err(Error::from);
        drop(conn);
        drop(ticket);
        self.note_write(&out);
        out
    }

    /// `VACUUM` under `spawn_blocking`.
    pub async fn vacuum(&self) -> Result<(), Error> {
        let db = self.clone();
        join(tokio::task::spawn_blocking(move || db.vacuum_blocking()).await)
    }
}
