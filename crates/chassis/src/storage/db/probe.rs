//! What a project needs to report its store honestly: a write probe for
//! `/healthz` and writes that carry the project's own error type. Lifted from
//! kyu (2026-11-01): kyu tells "unknown topic" apart from "disk full" and
//! marks the store unhealthy only on the second.

use rusqlite::{Transaction, TransactionBehavior};

use super::{Db, join, lock};
use crate::core::error::Error;
use crate::shell::backup::{self, HELD_WRITE_LIMIT};

impl Db {
    /// Whether the file still takes writes: `BEGIN IMMEDIATE`, then a
    /// rollback, writing nothing. Catches a store that went read-only (a
    /// full or remounted disk) before the next real write does. Takes no
    /// backup ticket, since it changes nothing on disk.
    pub fn probe_writable(&self) -> Result<(), Error> {
        let mut conn = lock(&self.inner.writer);
        let out = (|| {
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            tx.rollback()?;
            Ok(())
        })();
        drop(conn);
        self.note_write(&out);
        out.map_err(|e: Error| {
            Error::new(
                e.kind,
                format!("the store does not take writes: {}", e.message),
                e.remedy,
            )
        })
    }

    /// [`Db::write_blocking`] for a closure that returns the project's own
    /// error type. A failure of the kit's part (the backup ticket, `BEGIN`,
    /// `COMMIT`) arrives as `E::from(Error)` and counts towards
    /// [`Db::recent_write_failure`]; the closure's own errors do not, so a
    /// refusal such as "unknown topic" never makes the store look sick. A
    /// project that sees a storage failure inside its closure reports it with
    /// [`Db::note_failure`].
    pub fn write_blocking_as<T, E>(
        &self,
        f: impl FnOnce(&Transaction) -> Result<T, E>,
    ) -> Result<T, E>
    where
        E: From<Error>,
    {
        let ticket = backup::writing_blocking_within(HELD_WRITE_LIMIT)?;
        let mut conn = lock(&self.inner.writer);
        let begun = conn.transaction_with_behavior(TransactionBehavior::Immediate);
        let tx = match begun {
            Ok(tx) => tx,
            Err(e) => {
                let e = Error::from(e);
                self.note_write::<()>(&Err(e.clone()));
                return Err(e.into());
            }
        };
        let value = f(&tx)?;
        let committed = tx.commit().map_err(Error::from);
        drop(ticket);
        self.note_write(&committed);
        committed?;
        Ok(value)
    }

    /// [`Db::write_blocking_as`] under `spawn_blocking`.
    pub async fn write_as<T, E, F>(&self, f: F) -> Result<T, E>
    where
        T: Send + 'static,
        E: From<Error> + Send + 'static,
        F: FnOnce(&Transaction) -> Result<T, E> + Send + 'static,
    {
        let db = self.clone();
        match tokio::task::spawn_blocking(move || db.write_blocking_as(f)).await {
            Ok(out) => out,
            Err(e) => Err(E::from(join::<T>(Err(e)).err().unwrap_or_else(|| {
                Error::internal("a database task failed", "report this to the project")
            }))),
        }
    }

    /// Count a storage failure the project saw itself (inside a
    /// [`Db::write_as`] closure) towards [`Db::recent_write_failure`], so the
    /// status page and `/healthz` say what the project knows.
    pub fn note_failure(&self, failure: &Error) {
        self.note_write::<()>(&Err(failure.clone()));
    }
}
