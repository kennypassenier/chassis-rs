//! `--check` for a database file: open it read-only, run `quick_check`,
//! read its schema version, and create or migrate nothing. Its own module
//! because it must stay free of every pragma and write the normal open does;
//! it also holds `Db::inspect` and the `Inspection` accessors.

use std::path::Path;

use rusqlite::{Connection, OpenFlags};

use super::{Db, Inspection};
use crate::core::error::Error;

impl Db {
    /// What `--check` asks: does the file open, is it intact, how far is it
    /// from this binary. Read-only, no pragma set, nothing created or
    /// migrated.
    pub fn inspect(path: &Path, known: usize) -> Result<Inspection, Error> {
        if !path.exists() {
            return Ok(Inspection {
                path: path.to_path_buf(),
                exists: false,
                schema: None,
                known,
                quick_check: None,
            });
        }
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| {
            Error::config(
                format!("cannot open the database {} read-only: {e}", path.display()),
                "check the file's permissions; the service user must be able to read it",
            )
        })?;
        let quick: String = conn.query_row("PRAGMA quick_check(1)", [], |r| r.get(0))?;
        if quick != "ok" {
            return Err(Error::config(
                format!(
                    "the database {} is damaged: quick_check says `{quick}`",
                    path.display()
                ),
                "restore the newest backup or the pre-update copy before starting",
            ));
        }
        let schema = conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? as usize;
        Ok(Inspection {
            path: path.to_path_buf(),
            exists: true,
            schema: Some(schema),
            known,
            quick_check: Some(quick),
        })
    }
}

impl Inspection {
    /// The database is newer than this binary.
    pub fn is_newer(&self) -> bool {
        self.schema.is_some_and(|s| s > self.known)
    }

    /// One line for `--check`.
    pub fn describe(&self) -> String {
        match self.schema {
            None => format!(
                "no database yet at {}; it is created at start",
                self.path.display()
            ),
            Some(s) if s > self.known => format!(
                "database at {} is schema {s} but this binary knows {}: it was written by a newer build",
                self.path.display(),
                self.known
            ),
            Some(s) if s < self.known => format!(
                "database at {} is readable and intact: schema {s}, this binary knows {}; the migration runs at start, --check applies nothing",
                self.path.display(),
                self.known
            ),
            Some(s) => format!(
                "database OK at {} (schema {s}, current)",
                self.path.display()
            ),
        }
    }
}
