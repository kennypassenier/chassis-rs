//! Compacting the app's file from the Storage page: what a `VACUUM` would
//! do, and the refusal while a backup pause holds the state. Its own
//! module because it rewrites the whole file, unlike the row-level
//! operations beside it.

use super::{AppDb, CompactPreview, LAST_COMPACTED_KEY};
use crate::core::error::{Error, Kind};

impl AppDb {
    /// The body of [`AppDb::compact`]: refuse while paused, vacuum, and
    /// remember when.
    pub(super) fn run_compact(&self) -> Result<CompactPreview, Error> {
        if crate::shell::backup::is_paused() {
            return Err(Error::new(
                Kind::Overloaded,
                "paused for a backup",
                format!(
                    "retry after {} s",
                    crate::shell::backup::seconds_left().unwrap_or(1)
                ),
            ));
        }
        let before = self.compact_preview()?;
        self.db()?.vacuum_blocking()?;
        // Remembered in the file itself, so "last compacted" survives a restart.
        let at = crate::shell::time::now_rfc3339();
        self.write_blocking(|tx| crate::storage::meta_set(tx, LAST_COMPACTED_KEY, &at))?;
        tracing::info!(
            audit = true,
            reclaimed = before.reclaimable_bytes,
            "storage: app database compacted from the Storage page"
        );
        self.compact_preview()
    }
}
