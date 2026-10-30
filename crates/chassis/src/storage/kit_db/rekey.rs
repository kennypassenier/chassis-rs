//! Re-sealing the kit database's fields from one key to another, for a
//! `SECRET_KEY` rotation. Its own module because it opens the file itself
//! and shares no state with a running [`KitDb`].

use std::path::Path;

use super::seal::{open_text, seal_text};
use super::{KitDb, kit_migrations};
use crate::core::crypto::Key;
use crate::core::error::Error;
use crate::storage::db::Db;

impl KitDb {
    /// Re-seal every sealed field from `old` to `new`, in ONE transaction.
    /// A field that already opens with `new` is left alone, so a rerun is
    /// safe; one that opens with neither key aborts the lot with the same
    /// remedy `rekey_dir` gives. Returns the number of fields re-sealed.
    pub(crate) fn rekey(path: &Path, old: &Key, new: &Key) -> Result<usize, Error> {
        let db = Db::open(path, &kit_migrations())?;
        let (old, new) = (old.clone(), new.clone());
        db.write_blocking(move |tx| {
            let mut done = 0;
            for (table, column) in [
                ("kit_clients", "token_sealed"),
                ("kit_clients", "fields_sealed"),
                ("kit_passkeys", "credential_sealed"),
            ] {
                let cells: Vec<(i64, String)> = {
                    let mut stmt = tx.prepare(&format!(
                        "SELECT rowid, \"{column}\" FROM \"{table}\" WHERE \"{column}\" IS NOT NULL"
                    ))?;
                    stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
                        .collect::<Result<_, _>>()?
                };
                for (rowid, text) in cells {
                    if open_text(&new, &text, "field").is_ok() {
                        continue;
                    }
                    let plain = open_text(&old, &text, "field").map_err(|e| {
                        Error::config(
                            format!("a field in {table}.{column} opens with neither the old nor the new key: {}", e.message),
                            "the OLD_SECRET_KEY is not the key this database was sealed with; find the key that wrote it (the environment file before the rotation)",
                        )
                    })?;
                    tx.execute(
                        &format!("UPDATE \"{table}\" SET \"{column}\" = ?1 WHERE rowid = ?2"),
                        rusqlite::params![seal_text(&new, &plain)?, rowid],
                    )?;
                    done += 1;
                }
            }
            Ok(done)
        })
    }
}
