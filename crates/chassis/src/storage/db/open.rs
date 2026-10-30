//! Opening a database file: create the directory, set the durability
//! pragmas, apply the migrations (retrying a racing start) and open the
//! read-only pool. Its own module because it is the one place that knows
//! how a file becomes a ready [`Db`]; the handle itself only uses it.

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rusqlite::{Connection, OpenFlags};

use super::migrate::migrate;
use super::{BUSY_TIMEOUT, Db, Inner, Migration, READERS, WAL_SIZE_LIMIT};
use crate::core::error::{Error, Kind};

/// Bookkeeping the kit itself needs (import markers, format versions),
/// outside the numbered migrations so a project's list is all its own.
pub(super) const META_DDL: &str =
    "CREATE TABLE IF NOT EXISTS chassis_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;";

pub(super) fn pragmas(conn: &Connection, wal: bool) -> Result<(), Error> {
    conn.busy_timeout(BUSY_TIMEOUT)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    if wal {
        let mode: String = conn.query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))?;
        if !mode.eq_ignore_ascii_case("wal") {
            return Err(Error::config(
                format!("SQLite refused write-ahead logging and settled on `{mode}`"),
                "keep the state directory on a local filesystem; a network mount cannot give WAL, and the durability promise depends on it",
            ));
        }
        // SQLite folds the log into the database by itself every 1000 pages,
        // but keeps the file at its largest size; the Storage page then
        // showed about 4 MB of "pending writes" next to a 40 KB kit file
        // (Kenny, 2026-10-30, kyu and almanac). After each fold the log is
        // trimmed back to this size.
        conn.query_row(
            &format!("PRAGMA journal_size_limit = {WAL_SIZE_LIMIT}"),
            [],
            |r| r.get::<_, i64>(0),
        )?;
    }
    conn.pragma_update(None, "synchronous", "FULL")?;
    Ok(())
}

/// Open (creating it) the file at `path`, bring its schema up to date.
pub(super) fn open_file(path: &Path, migrations: &[Migration]) -> Result<Db, Error> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| {
            Error::config(
                format!("cannot create {}: {e}", dir.display()),
                "create the state directory and make the service user its owner",
            )
        })?;
    }
    let shown = path.display().to_string();
    let mut writer = Connection::open(path).map_err(|e| {
        Error::config(
            format!("cannot open the database {shown}: {e}"),
            "check the state directory's permissions; the service user must own it",
        )
    })?;
    // Two processes starting on one file at the same moment can find
    // the first WAL switch locked; the setup is idempotent, so retry.
    let mut attempt = 0;
    let schema = loop {
        let setup = (|| {
            pragmas(&writer, true)?;
            writer.execute_batch(META_DDL)?;
            migrate(&mut writer, migrations, &shown)
        })();
        match setup {
            Err(e) if e.kind == Kind::Overloaded && attempt < 40 => {
                attempt += 1;
                std::thread::sleep(Duration::from_millis(50));
            }
            other => break other?,
        }
    };
    let mut readers = Vec::with_capacity(READERS);
    for _ in 0..READERS {
        let r = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| {
            Error::config(
                format!("cannot open a read connection to {shown}: {e}"),
                "check the file's permissions",
            )
        })?;
        pragmas(&r, false)?;
        readers.push(Mutex::new(r));
    }
    Ok(Db {
        inner: Arc::new(Inner {
            path: Some(path.to_path_buf()),
            writer: Mutex::new(writer),
            readers,
            schema,
            last_failure: Mutex::new(None),
        }),
    })
}
