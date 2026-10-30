//! The one-time import of the old sealed JSON files into the kit database:
//! ONE transaction over every source, counts verified, files renamed after
//! the commit. Its own module because it runs once per install and only
//! reads the old formats.

use std::path::{Path, PathBuf};

use rusqlite::Transaction;

use super::clients::insert_clients;
use super::passkeys::insert_passkeys;
use super::sessions::insert_sessions;
use super::{ImportPlan, KitDb, PasskeyRow};
use crate::core::clients::ClientsFile;
use crate::core::crypto::Key;
use crate::core::error::Error;
use crate::core::session::SessionsFile;
use crate::shell::store::EncryptedFile;
use crate::storage::db::{meta_get, meta_set};

impl KitDb {
    /// Move the old sealed JSON files in, once: ONE transaction over every
    /// source the plan names. Any failure (a file that does not open, a
    /// duplicate id, a count that does not match) rolls the whole thing
    /// back, writes nothing and renames nothing; the caller keeps running on
    /// the old files and the next start tries again. On success the markers
    /// commit with the data, the counts are verified, and the files are
    /// renamed `*.migrated`. A source whose marker is set is never read
    /// again, so a restored old file cannot overwrite newer data.
    pub(crate) fn import_legacy(&self, plan: &ImportPlan) -> Result<usize, Error> {
        let mut sources: Vec<(&str, PathBuf)> = Vec::new();
        if plan.clients {
            sources.push(("clients", plan.state_dir.join("clients.json.enc")));
        }
        sources.push(("sessions", plan.state_dir.join(plan.sessions_file)));
        if plan.passkeys {
            sources.push(("passkeys", plan.state_dir.join("passkeys.json.enc")));
        }
        let key = self.key.clone();
        let renames = self.db.write_blocking(|tx| {
            let mut renames: Vec<PathBuf> = Vec::new();
            for (what, path) in &sources {
                let marker = format!("import.{what}");
                if meta_get(tx, &marker)?.is_some() {
                    continue;
                }
                if path.exists() {
                    import_source(tx, &key, what, path)?;
                    renames.push(path.clone());
                }
                // A source with no file is marked too: a fresh install has
                // nothing to import, now or later.
                meta_set(tx, &marker, &crate::shell::time::now_rfc3339())?;
            }
            Ok(renames)
        })
        .map_err(|e| {
            // A key or file problem has its own remedy (rekey, restore); a
            // database error's generic one would mislead here.
            let remedy = if e.kind == crate::core::error::Kind::Config {
                format!("{} Nothing was written and the old files stay in use.", e.remedy)
            } else {
                "nothing was written and the old files stay in use; fix what the message names (a duplicate id, for one) or restore the file from the last backup".to_string()
            };
            Error::new(
                e.kind,
                format!("moving the old stores into the kit database failed and was rolled back: {}", e.message),
                remedy,
            )
        })?;
        let moved = renames.len();
        crate::storage::app_db::rename_migrated(&renames);
        if moved > 0 {
            tracing::info!(
                files = moved,
                "kit stores moved into the kit database; the old files are renamed *.migrated"
            );
        }
        Ok(moved)
    }
}

/// Read one old file and insert it; verify the row count afterwards.
fn import_source(tx: &Transaction, key: &Key, what: &str, path: &Path) -> Result<(), Error> {
    let file = EncryptedFile::new(path.to_path_buf(), key.clone(), "store");
    let count = |table: &str| -> Result<i64, Error> {
        Ok(
            tx.query_row(&format!("SELECT count(*) FROM \"{table}\""), [], |r| {
                r.get(0)
            })?,
        )
    };
    let (table, expected, before) = match what {
        "clients" => {
            let loaded: ClientsFile = file.load()?.unwrap_or_default();
            loaded.check_format()?;
            let before = count("kit_clients")?;
            insert_clients(tx, key, &loaded)?;
            ("kit_clients", loaded.clients.len() as i64, before)
        }
        "sessions" => {
            let loaded: SessionsFile = file.load()?.unwrap_or_default();
            let before = count("kit_sessions")?;
            insert_sessions(tx, &loaded)?;
            ("kit_sessions", loaded.sessions.len() as i64, before)
        }
        #[cfg(feature = "passkeys")]
        "passkeys" => {
            let loaded: crate::shell::passkeys::PasskeysFile = file.load()?.unwrap_or_default();
            if loaded.v != crate::shell::passkeys::PASSKEYS_FORMAT {
                return Err(Error::config(
                    format!(
                        "passkeys store is format {} but this build reads {}",
                        loaded.v,
                        crate::shell::passkeys::PASSKEYS_FORMAT
                    ),
                    "restore the pre-update copy or upgrade",
                ));
            }
            let before = count("kit_passkeys")?;
            let rows = loaded
                .passkeys
                .iter()
                .map(|p| {
                    Ok(PasskeyRow {
                        id: p.id.clone(),
                        label: p.label.clone(),
                        created_at: p.created_at.clone(),
                        last_used_at: p.last_used_at.clone(),
                        credential_json: serde_json::to_string(&p.passkey).map_err(|e| {
                            Error::internal(format!("serialise a passkey: {e}"), "report this")
                        })?,
                    })
                })
                .collect::<Result<Vec<_>, Error>>()?;
            insert_passkeys(tx, key, &rows)?;
            ("kit_passkeys", rows.len() as i64, before)
        }
        other => {
            return Err(Error::internal(
                format!("unknown import source `{other}`"),
                "report this",
            ));
        }
    };
    let after = count(table)?;
    if after - before != expected {
        return Err(Error::dependency(
            format!(
                "importing {what} wrote {} row(s) but {} file held {expected}",
                after - before,
                path.display()
            ),
            "nothing was imported; the old files stay in use and the import is retried at the next start",
        ));
    }
    Ok(())
}
