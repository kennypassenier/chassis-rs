//! Compacting the app's file from the Storage page: what a `VACUUM` would
//! do, and the refusal while a backup pause holds the state. Its own
//! module because it rewrites the whole file, unlike the row-level
//! operations beside it.

use super::{AppDb, CompactPreview, LAST_COMPACTED_KEY};
use crate::core::error::{Error, Kind};

impl AppDb {
    /// When the app file was last compacted from the Storage page (RFC 3339),
    /// `None` if it never was.
    pub fn last_compacted_at(&self) -> Result<Option<String>, Error> {
        self.read_blocking(|c| crate::storage::meta_get(c, LAST_COMPACTED_KEY))
    }

    /// What a compact would do: the file, the pages it would hand back.
    pub fn compact_preview(&self) -> Result<CompactPreview, Error> {
        let sizes = self.sizes()?;
        Ok(CompactPreview {
            file_bytes: sizes.db_bytes,
            reclaimable_bytes: sizes.reclaimable_bytes,
            // VACUUM writes a full copy first.
            free_space_needed_bytes: sizes.db_bytes.saturating_sub(sizes.reclaimable_bytes),
            paused: crate::shell::backup::is_paused(),
        })
    }

    /// `VACUUM` the app's file. Refused while a backup pause holds the
    /// state: a rewrite of the whole file is exactly what the backup must
    /// not see.
    pub fn compact(&self) -> Result<CompactPreview, Error> {
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
