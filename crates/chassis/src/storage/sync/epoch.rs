//! The file's epoch (4.6): a random id in `chassis_meta` that rides inside
//! every feed cursor, so a restored copy of the file cannot roll the change
//! log back unnoticed.
//!
//! **The problem.** `seq` is a counter inside the file. Restore an older copy
//! and it counts again from the older value; a device whose cursor is past
//! that value would ask for changes the file has not reached yet and get
//! nothing until new writes pass it, missing everything in between.
//!
//! **What renews the epoch.** The kit has no restore command (backups are
//! made by tools outside it), so it renews at the two places it can see:
//! 1. every copy the kit makes itself (`VACUUM INTO`: the pre-migration copy,
//!    the pre-update copy, `AppDb::vacuum_into`) carries a fresh epoch, so
//!    putting such a copy back is a new epoch by construction;
//! 2. at every open, the file's identity (inode and creation time) is
//!    compared with the one stored beside the epoch. A restore by a backup
//!    tool writes a new file, so the identity differs and the epoch is renewed.
//!
//! What this cannot see: a restore that overwrites the file in place (`cp`
//! onto the old name) from a copy the kit did not make. That copy carries the
//! old epoch and the old identity. The remedy is to restore through a copy
//! the kit made, or to delete the `sync.epoch` row in the restored file.

use std::path::Path;

use rusqlite::Connection;

use crate::core::error::Error;
use crate::storage::db::{Db, meta_get, meta_set};

/// `chassis_meta` key of the epoch (16 hex digits, never 0).
pub(crate) const META_EPOCH: &str = "sync.epoch";
/// `chassis_meta` key of the identity of the file the epoch was made for.
const META_WITNESS: &str = "sync.witness";

/// A fresh epoch: 64 random bits, never 0 (0 means "none" in a cursor).
fn fresh() -> Result<u64, Error> {
    loop {
        let bytes = crate::shell::time::random_hex(8)?;
        let value = u64::from_str_radix(&bytes, 16).unwrap_or(0);
        if value != 0 {
            return Ok(value);
        }
    }
}

/// The epoch of the file, or 0 when it has none (a plain connection that
/// only ran [`create_tables`](super::create_tables)).
pub(crate) fn read(conn: &Connection) -> Result<u64, Error> {
    match meta_get(conn, META_EPOCH)? {
        None => Ok(0),
        Some(v) => u64::from_str_radix(&v, 16).map_err(|_| {
            Error::internal(
                format!("the sync epoch `{v}` in chassis_meta is not a number"),
                "restore the app database from a backup; do not edit chassis_meta",
            )
        }),
    }
}

/// Give the file a new epoch. Every cursor handed out so far becomes a 410.
pub(crate) fn renew(conn: &Connection) -> Result<u64, Error> {
    let epoch = fresh()?;
    meta_set(conn, META_EPOCH, &format!("{epoch:016x}"))?;
    Ok(epoch)
}

/// At open: create the epoch of a new file, and renew it when the file is
/// not the one the epoch was made for. `path` is `None` for a memory
/// database (it has no identity, only an epoch).
pub(crate) fn ensure(db: &Db, path: Option<&Path>) -> Result<(), Error> {
    let identity = path.and_then(identity_of);
    db.write_blocking(|tx| {
        let known = read(tx)?;
        let stored = meta_get(tx, META_WITNESS)?;
        if known == 0 {
            renew(tx)?;
        } else if identity.is_some() && stored.is_some() && stored != identity {
            let epoch = renew(tx)?;
            tracing::warn!(
                epoch = format!("{epoch:016x}"),
                "the app database file is not the one the change log's epoch was made for (restored?); devices will resync"
            );
        }
        if let Some(id) = &identity {
            meta_set(tx, META_WITNESS, id)?;
        }
        Ok(())
    })
}

/// A copy made by the kit gets its own epoch, so restoring it is a new
/// epoch. A database without the epoch row is left alone.
pub(crate) fn renew_in_copy(dest: &Path) -> Result<(), Error> {
    let copy = Connection::open(dest)?;
    let has_meta: i64 = copy.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'chassis_meta'",
        [],
        |r| r.get(0),
    )?;
    if has_meta == 0 || read(&copy)? == 0 {
        return Ok(());
    }
    renew(&copy)?;
    // The copy never belonged to the file it was taken from: forget the
    // identity so the first open of it as the live file stores its own.
    copy.execute("DELETE FROM chassis_meta WHERE key = ?1", [META_WITNESS])?;
    Ok(())
}

/// `<inode>:<creation time in ns>` of the file; `None` where the platform
/// gives neither (then only copies made by the kit renew the epoch).
#[cfg(unix)]
fn identity_of(path: &Path) -> Option<String> {
    use std::os::unix::fs::MetadataExt;
    use std::time::UNIX_EPOCH;
    let meta = std::fs::metadata(path).ok()?;
    let born = meta
        .created()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_nanos());
    Some(format!("{}:{born}", meta.ino()))
}

#[cfg(not(unix))]
fn identity_of(_path: &Path) -> Option<String> {
    None
}
