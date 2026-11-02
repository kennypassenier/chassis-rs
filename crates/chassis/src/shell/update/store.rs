//! The updater's state in the kit database: the one pending update and the
//! versions that were rolled back. Its own module because it is the only
//! place that touches those tables; the pipeline above it asks questions
//! ("what is pending", "is this version skipped") and never sees SQL.
//!
//! These used to be `update-state.json` and `update-skip.json`. The state
//! must survive the binary swap and a restart, so every write is one
//! committed transaction (`synchronous=FULL`) before the caller goes on. The
//! old files are imported once by [`super::legacy`].

use std::path::Path;

use rusqlite::{OptionalExtension, params};

use crate::core::error::Error;
use crate::core::update::UpdateState;
use crate::storage::Db;

/// The pending-update row and the skip list, on the kit file.
#[derive(Clone)]
pub(super) struct UpdateStore {
    db: Db,
}

/// The update state belongs to this state dir's kit file: `Db::open` runs
/// the kit migrations (creating the tables), then the old files come in.
pub(super) fn open_kit_file(state_dir: &Path, file_name: &str) -> Result<UpdateStore, Error> {
    let db = Db::open(
        &state_dir.join(file_name),
        &crate::storage::kit_migrations(),
    )?;
    UpdateStore::with_db(db, state_dir)
}

impl UpdateStore {
    /// Use an already open kit file and bring the old JSON files in.
    pub(super) fn with_db(db: Db, state_dir: &Path) -> Result<Self, Error> {
        let store = UpdateStore { db };
        super::legacy::import(&store.db, state_dir)?;
        Ok(store)
    }

    /// The pending update, if one is on probation.
    pub(super) fn state(&self) -> Result<Option<UpdateState>, Error> {
        self.db.read_blocking(|c| {
            Ok(c.query_row(
                "SELECT from_version, to_version, previous_binary, attempts \
                 FROM kit_update_state WHERE id = 1",
                [],
                |r| {
                    Ok(UpdateState {
                        from_version: r.get(0)?,
                        to_version: r.get(1)?,
                        previous_binary: r.get(2)?,
                        attempts: r.get(3)?,
                    })
                },
            )
            .optional()?)
        })
    }

    /// Record (or replace) the pending update.
    pub(super) fn set_state(&self, state: &UpdateState) -> Result<(), Error> {
        self.db.write_blocking(|tx| put_state(tx, state))
    }

    /// The update is over, one way or the other.
    pub(super) fn clear_state(&self) -> Result<(), Error> {
        self.db.write_blocking(|tx| {
            tx.execute("DELETE FROM kit_update_state", [])?;
            Ok(())
        })
    }

    /// Versions that were installed and rolled back (CF-3): never retried.
    pub(super) fn is_skipped(&self, version: &str) -> Result<bool, Error> {
        self.db.read_blocking(|c| {
            Ok(c.query_row(
                "SELECT 1 FROM kit_update_skipped WHERE version = ?1",
                [version],
                |_| Ok(()),
            )
            .optional()?
            .is_some())
        })
    }

    pub(super) fn remember_skip(&self, version: &str) -> Result<(), Error> {
        self.db.write_blocking(|tx| put_skip(tx, version))
    }
}

/// Insert or replace the one state row. Shared with the legacy import so
/// both write exactly the same shape.
pub(super) fn put_state(tx: &rusqlite::Transaction, s: &UpdateState) -> Result<(), Error> {
    tx.execute(
        "INSERT INTO kit_update_state (id, from_version, to_version, previous_binary, attempts) \
         VALUES (1, ?1, ?2, ?3, ?4) \
         ON CONFLICT(id) DO UPDATE SET from_version = excluded.from_version, \
         to_version = excluded.to_version, previous_binary = excluded.previous_binary, \
         attempts = excluded.attempts",
        params![s.from_version, s.to_version, s.previous_binary, s.attempts],
    )?;
    Ok(())
}

/// Add a version to the skip list; a version already there stays as it was.
pub(super) fn put_skip(tx: &rusqlite::Transaction, version: &str) -> Result<(), Error> {
    tx.execute(
        "INSERT OR IGNORE INTO kit_update_skipped (version, skipped_at) VALUES (?1, ?2)",
        params![version, crate::shell::time::now_rfc3339()],
    )?;
    Ok(())
}
