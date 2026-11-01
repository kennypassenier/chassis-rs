//! SQLite storage for a service (3.11.0): the kit's own file, the app's
//! file, a size budget that only warns, and targeted delete controls.
//!
//! Two files live in the state directory: `<name>-kit.db` holds what the
//! kit keeps for itself (clients, sessions, passkeys; secrets sealed per
//! field) and is never touched by cleanup, vacuum or delete; `<name>.db`
//! is the app's, opened through [`crate::App::app_db`]. The design and
//! Kenny's decisions are in `docs/STORAGE_DESIGN.md`.

#[cfg(feature = "dashboard")]
pub(crate) mod api;
mod app_db;
mod db;
mod kinds;
#[cfg(feature = "dashboard")]
mod kit_db;
#[cfg(all(feature = "dashboard", feature = "notify"))]
pub(crate) mod notify_meta;
#[cfg(feature = "dashboard")]
pub(crate) mod outbox;
mod prefs;
#[cfg(feature = "dashboard")]
pub(crate) mod prefs_api;
#[cfg(feature = "dashboard")]
pub(crate) mod prefs_inject;
#[cfg(feature = "dashboard")]
mod prefs_kind;
mod prefs_rules;
#[cfg(feature = "dashboard")]
pub(crate) mod push_store;
mod runtime;

pub use app_db::{
    AppDb, AppDbSpec, CompactPreview, Deleted, ImportContext, ImportHook, ImportReport,
    ImportState, ImportStore, KindOverview, Preview, StorageProblem,
};
pub use db::{
    Db, DbOptions, FileSizes, Inspection, MAX_READERS, Migration, meta_get, meta_set, wal_path,
};
pub use kinds::{
    DataKind, Filter, FilterKind, KindOps, KindStats, Now, ResolvedSelector, Selector, TimeFormat,
};
#[cfg(feature = "passkeys")]
pub(crate) use kit_db::PasskeyRow;
#[cfg(feature = "dashboard")]
pub(crate) use kit_db::{ImportPlan, KitDb, kit_file_name, kit_migrations, kit_schema_version};

/// Re-seal the sealed fields of the kit database at `path` from `old` to
/// `new` in one transaction (what `<name> rekey` does beside the JSON files).
#[cfg(feature = "dashboard")]
pub(crate) fn rekey_kit_file(
    path: &Path,
    old: &crate::core::crypto::Key,
    new: &crate::core::crypto::Key,
) -> Result<usize, Error> {
    KitDb::rekey(path, old, new)
}
pub use prefs::{
    ADMIN_SCOPE, MemoryPrefStore, PrefFuture, PrefStore, Quota, SetOutcome, SqlitePrefStore,
};
#[cfg(feature = "dashboard")]
pub(crate) use prefs_kind::prefs_kind;
pub use prefs_rules::{BrowserKeys, PrefLimits, Prefs};
pub(crate) use runtime::BudgetSetup;
pub use runtime::{FileReport, Fixed, Level, Storage, StorageConfig, StorageReport, WarnHook};

/// Rename old files `x` to `x.migrated` (`x.migrated.2` when that exists).
/// What the kit does itself for the files an import reports as moved; a
/// project that moves a store later, in a step of its own, calls it after
/// its own commit (3.12.0, homelab gap 140). A failed rename is a warning.
pub fn mark_migrated(files: &[PathBuf]) {
    app_db::rename_migrated(files);
}

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
