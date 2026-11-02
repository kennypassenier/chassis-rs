//! Retention (decision 4): tombstones older than the window are removed by
//! the kit's daily cleanup. The highest removed `seq` of a collection
//! becomes its floor in `chassis_meta`; a cursor below it gets the 410.
//!
//! Only tombstones go. A live item's row stays (it is "unfinished by its own
//! definition") and the table keeps at most one row per item.

use std::time::Duration;

use super::collection::SyncCollection;
use super::ddl::floor_key;
use super::log::{SqliteChangeLog, read_floor};
use crate::core::error::Error;
use crate::storage::db::meta_set;

/// The tombstone age when neither the collection nor the environment says.
pub(crate) const DEFAULT_RETAIN_DAYS: u64 = 30;
const DAY: u64 = 24 * 3600;

/// How long each collection keeps its tombstones.
#[derive(Debug, Clone)]
pub(crate) struct RetentionPlan {
    per_collection: Vec<(String, Duration)>,
}

impl RetentionPlan {
    /// `fixed_days` is `<P>_SYNC_RETAIN_DAYS` when the operator set it (it
    /// wins, as the storage budget's setting does); else each collection's
    /// own [`SyncCollection::retain`]; else 30 days.
    pub(crate) fn new(collections: &[SyncCollection], fixed_days: Option<u64>) -> Self {
        let default = Duration::from_secs(DEFAULT_RETAIN_DAYS * DAY);
        let per_collection = collections
            .iter()
            .map(|c| {
                let window = match fixed_days {
                    Some(days) => Duration::from_secs(days * DAY),
                    None => c.retention().unwrap_or(default),
                };
                (c.name().to_string(), window)
            })
            .collect();
        RetentionPlan { per_collection }
    }

    /// How long `collection` keeps its tombstones.
    #[cfg(test)]
    pub(crate) fn window_for(&self, collection: &str) -> Duration {
        self.per_collection
            .iter()
            .find(|(n, _)| n == collection)
            .map_or(Duration::ZERO, |(_, w)| *w)
    }

    /// Remove the tombstones older than their window as of `now` (epoch
    /// seconds); the number of rows removed. Runs on the caller's thread.
    pub(crate) fn run(&self, log: &SqliteChangeLog, now: u64) -> Result<u64, Error> {
        let mut removed = 0;
        for (name, window) in &self.per_collection {
            let cutoff = now.saturating_sub(window.as_secs());
            removed += prune_tombstones(log, name, cutoff)?;
        }
        Ok(removed)
    }
}

/// Delete `collection`'s tombstones changed before `cutoff` (epoch seconds)
/// and raise the floor to the highest `seq` removed. One transaction.
pub(super) fn prune_tombstones(
    log: &SqliteChangeLog,
    collection: &str,
    cutoff: u64,
) -> Result<u64, Error> {
    log.app().write_blocking(|tx| {
        let top: Option<i64> = tx.query_row(
            "SELECT MAX(seq) FROM chassis_sync WHERE collection = ?1 AND deleted = 1 AND changed_at < ?2",
            rusqlite::params![collection, cutoff as i64],
            |r| r.get(0),
        )?;
        let Some(top) = top else { return Ok(0) };
        let removed = tx.execute(
            "DELETE FROM chassis_sync WHERE collection = ?1 AND deleted = 1 AND changed_at < ?2",
            rusqlite::params![collection, cutoff as i64],
        )?;
        let floor = read_floor(tx, collection)?.seq().max(top as u64);
        meta_set(tx, &floor_key(collection), &floor.to_string())?;
        Ok(removed as u64)
    })
}
