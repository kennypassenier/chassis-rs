//! `--check` for a database file: open it read-only, run `quick_check`,
//! read its schema version, and create or migrate nothing. Its own module
//! because it must stay free of every pragma and write the normal open does.

use std::path::Path;

use rusqlite::{Connection, OpenFlags};

use super::Inspection;
use crate::core::error::Error;

/// What `--check` asks of one file; see [`super::Db::inspect`].
pub(super) fn inspect_file(path: &Path, known: usize) -> Result<Inspection, Error> {
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
