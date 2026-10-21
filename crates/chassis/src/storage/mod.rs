//! SQLite storage for a service (3.11.0): the kit's own file, the app's
//! file, a size budget that only warns, and targeted delete controls.
//!
//! Two files live in the state directory: `<name>-kit.db` holds what the
//! kit keeps for itself (clients, sessions, passkeys; secrets sealed per
//! field) and is never touched by cleanup, vacuum or delete; `<name>.db`
//! is the app's, opened through [`crate::App::app_db`]. The design and
//! Kenny's decisions are in `docs/STORAGE_DESIGN.md`.

mod app_db;
mod db;
mod kinds;
mod runtime;

pub use app_db::{
    AppDb, AppDbSpec, CompactPreview, Deleted, ImportContext, ImportHook, ImportReport,
    ImportState, KindOverview, Preview, StorageProblem,
};
pub use db::{Db, FileSizes, Inspection, Migration, meta_get, meta_set, wal_path};
pub use kinds::{
    DataKind, Filter, FilterKind, KindOps, KindStats, Now, ResolvedSelector, Selector, TimeFormat,
};
pub use runtime::{FileReport, Level, Storage, StorageConfig, StorageReport, WarnHook};

/// The sqlite crate the handles are built on, re-exported so a project
/// writes its queries against the very version the kit links.
pub use rusqlite;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::core::error::Error;
use crate::shell::backup::{Mode, PauseHook};

/// The pause hook for a set of databases: once the write tickets drained,
/// fold each log into its file and truncate it, so a plain `tar` of the
/// state directory is a restorable copy. A busy answer (a reader still holds
/// the log after the 5 s busy timeout) is an error, which refuses the
/// in-process pause and makes `backup-pause` stop the unit instead.
pub fn pause_hook(dbs: Vec<Db>) -> PauseHook {
    Arc::new(move |_mode: Mode| {
        for db in &dbs {
            db.checkpoint()?;
        }
        Ok(())
    })
}

/// Copy each database file in `paths` that exists into `dest` as a
/// consistent snapshot (`VACUUM INTO`, never a byte copy of a live file).
/// A file of the same name already in `dest` — a raw copy of the state
/// directory made by the project's own state-copy hook — is replaced, with
/// its `-wal` and `-shm` leftovers. Used by the pre-update state copy, so a
/// downgrade restores a database that is sound.
pub fn copy_db_files(paths: &[PathBuf], dest: &Path) -> Result<(), Error> {
    use rusqlite::{Connection, OpenFlags};
    for src in paths {
        if !src.exists() {
            continue;
        }
        let Some(name) = src.file_name() else {
            continue;
        };
        let target = dest.join(name);
        for suffix in ["", "-wal", "-shm"] {
            let mut stale = target.as_os_str().to_owned();
            stale.push(suffix);
            let _ = std::fs::remove_file(PathBuf::from(stale));
        }
        let conn = Connection::open_with_flags(
            src,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        conn.busy_timeout(db::BUSY_TIMEOUT)?;
        db::vacuum_into_conn(&conn, &target, &target.to_string_lossy())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The pre-update copy replaces a raw copy of a live database with a
    /// snapshot, drops its `-wal` leftovers, skips files that do not exist.
    #[test]
    fn the_state_copy_snapshots_a_database_over_a_raw_copy() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("svc.db");
        let db = Db::open(&src, &[Migration::sql("CREATE TABLE t (v TEXT) STRICT;")]).unwrap();
        db.write_blocking(|tx| Ok(tx.execute("INSERT INTO t VALUES ('kept')", [])?))
            .unwrap();
        let dest = dir.path().join("copy");
        std::fs::create_dir(&dest).unwrap();
        // What a project's own cp -r of the state directory leaves behind.
        std::fs::write(dest.join("svc.db"), b"torn bytes").unwrap();
        std::fs::write(dest.join("svc.db-wal"), b"stale log").unwrap();
        copy_db_files(&[src.clone(), dir.path().join("missing.db")], &dest).unwrap();
        assert!(!dest.join("svc.db-wal").exists());
        assert!(!dest.join("missing.db").exists());
        let copy = Db::open(
            &dest.join("svc.db"),
            &[Migration::sql("CREATE TABLE t (v TEXT) STRICT;")],
        )
        .unwrap();
        let v: String = copy
            .read_blocking(|c| Ok(c.query_row("SELECT v FROM t", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(v, "kept");
    }
}
