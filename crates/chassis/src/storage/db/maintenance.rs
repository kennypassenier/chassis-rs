//! The file-level maintenance of a database: the checkpoint that settles
//! the write-ahead log, the sizes the budget reads and the verified
//! `VACUUM INTO` copy, with `Db::checkpoint`, `Db::sizes` and `FileSizes`.
//! Its own module because these work on the files on disk, not on rows.

use std::path::Path;

use rusqlite::{Connection, OpenFlags};

use super::{Db, FileSizes, lock, wal_path};
use crate::core::error::{Error, Kind};

/// `VACUUM INTO` plus verification, on any connection.
pub(crate) fn vacuum_into_conn(conn: &Connection, dest: &Path, shown: &str) -> Result<u64, Error> {
    if dest.exists() {
        return Err(Error::invalid(
            format!("{shown} already exists; VACUUM INTO refuses to overwrite"),
            "choose another name or remove the old copy first",
        ));
    }
    conn.execute("VACUUM INTO ?1", [shown])?;
    let bytes = std::fs::metadata(dest).map_or(0, |m| m.len());
    let verify = Connection::open_with_flags(dest, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let integrity: String = verify.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if integrity != "ok" {
        return Err(Error::dependency(
            format!("the copy at {shown} is not a sound database ({integrity})"),
            "it was left in place for inspection; check free space and take another",
        ));
    }
    Ok(bytes)
}

impl Db {
    /// Fold the log into the database and truncate it, so the files on disk
    /// stand still (what the backup pause needs). TRUNCATE, not PASSIVE, on
    /// purpose: PASSIVE gives up quietly while a reader holds the log, which
    /// would look like success and leave the very file we came to settle.
    /// A busy answer (after the 5 s busy timeout) is an error, and the
    /// pause then falls back to stopping the unit. Takes no write ticket:
    /// it runs INSIDE the pause, after the tickets drained.
    pub fn checkpoint(&self) -> Result<(), Error> {
        if self.inner.path.is_none() {
            return Ok(());
        }
        let conn = lock(&self.inner.writer);
        let (busy, _log, _done): (i64, i64, i64) =
            conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })?;
        if busy != 0 {
            return Err(Error::new(
                Kind::Overloaded,
                format!(
                    "the write-ahead log of {} could not be checkpointed: a reader or writer still holds it",
                    self.inner
                        .path
                        .as_deref()
                        .map_or_else(String::new, |p| p.display().to_string())
                ),
                "the pause falls back to stopping the unit; nothing is lost",
            ));
        }
        Ok(())
    }

    /// Sizes for the budget; the log is read from disk.
    pub fn sizes(&self) -> Result<FileSizes, Error> {
        let (pages, page_size, free) = self.read_blocking(|c| {
            Ok((
                c.query_row("PRAGMA page_count", [], |r| r.get::<_, i64>(0))?,
                c.query_row("PRAGMA page_size", [], |r| r.get::<_, i64>(0))?,
                c.query_row("PRAGMA freelist_count", [], |r| r.get::<_, i64>(0))?,
            ))
        })?;
        let wal = self
            .inner
            .path
            .as_ref()
            .map(|p| wal_path(p))
            .and_then(|p| std::fs::metadata(p).ok())
            .map_or(0, |m| m.len());
        Ok(FileSizes {
            db_bytes: (pages.max(0) * page_size.max(0)) as u64,
            wal_bytes: wal,
            reclaimable_bytes: (free.max(0) * page_size.max(0)) as u64,
        })
    }

    /// Write a complete, consistent copy of the database to `dest` while
    /// the service keeps running (`VACUUM INTO`); copying the file by hand
    /// mid-write is what this exists to stop. `dest` must not exist; it is
    /// checked with `integrity_check` afterwards. Used for the pre-update
    /// state copy.
    pub fn vacuum_into(&self, dest: &Path) -> Result<u64, Error> {
        let to = dest.to_string_lossy().into_owned();
        self.read_blocking(|c| vacuum_into_conn(c, dest, &to))
    }
}

impl FileSizes {
    /// Sizes built by hand (3.12.0), for a test of code that reads a
    /// [`super::StorageReport`].
    pub fn new(db_bytes: u64, wal_bytes: u64, reclaimable_bytes: u64) -> Self {
        FileSizes {
            db_bytes,
            wal_bytes,
            reclaimable_bytes,
        }
    }

    pub fn total(&self) -> u64 {
        self.db_bytes + self.wal_bytes
    }
}
