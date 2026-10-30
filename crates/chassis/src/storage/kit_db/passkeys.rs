//! The kit database's passkeys table: the credential is sealed, the id and
//! label are plain. Its own module because the passkeys feature is
//! optional and this table is only read when it is compiled in.

use std::collections::BTreeSet;

use rusqlite::Transaction;

use super::seal::{open_text, seal_text};
use super::{KitDb, PasskeyRow};
use crate::core::crypto::Key;
use crate::core::error::Error;

impl KitDb {
    #[cfg_attr(not(feature = "passkeys"), allow(dead_code))]
    pub(crate) fn load_passkeys(&self) -> Result<Vec<PasskeyRow>, Error> {
        let key = self.key.clone();
        self.db.read_blocking(|c| {
            let mut stmt = c.prepare(
                "SELECT id, label, created_at, last_used_at, credential_sealed FROM kit_passkeys ORDER BY rowid",
            )?;
            let mut rows = stmt.query([])?;
            let mut out = Vec::new();
            while let Some(r) = rows.next()? {
                let sealed: String = r.get(4)?;
                out.push(PasskeyRow {
                    id: r.get(0)?,
                    label: r.get(1)?,
                    created_at: r.get(2)?,
                    last_used_at: r.get(3)?,
                    credential_json: String::from_utf8(open_text(&key, &sealed, "a passkey")?)
                        .map_err(|_| Error::config("a passkey is not text", "restore the kit database from a backup"))?,
                });
            }
            Ok(out)
        })
    }

    #[cfg_attr(not(feature = "passkeys"), allow(dead_code))]
    pub(crate) fn save_passkeys(&self, rows: &[PasskeyRow]) -> Result<(), Error> {
        let key = self.key.clone();
        let rows = rows.to_vec();
        self.db
            .write_blocking(move |tx| write_passkeys(tx, &key, &rows))
    }
}

fn write_passkeys(tx: &Transaction, key: &Key, rows: &[PasskeyRow]) -> Result<(), Error> {
    let existing: BTreeSet<String> = tx
        .prepare("SELECT id FROM kit_passkeys")?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let mut keep = BTreeSet::new();
    for p in rows {
        keep.insert(p.id.clone());
        tx.execute(
            "INSERT INTO kit_passkeys (id, label, created_at, last_used_at, credential_sealed) \
             VALUES (?1, ?2, ?3, ?4, ?5) \
             ON CONFLICT(id) DO UPDATE SET label = excluded.label, last_used_at = excluded.last_used_at, \
               credential_sealed = excluded.credential_sealed",
            rusqlite::params![p.id, p.label, p.created_at, p.last_used_at, seal_text(key, p.credential_json.as_bytes())?],
        )?;
    }
    for gone in existing.difference(&keep) {
        tx.execute("DELETE FROM kit_passkeys WHERE id = ?1", [gone])?;
    }
    Ok(())
}

pub(super) fn insert_passkeys(
    tx: &Transaction,
    key: &Key,
    rows: &[PasskeyRow],
) -> Result<(), Error> {
    for p in rows {
        tx.execute(
            "INSERT INTO kit_passkeys (id, label, created_at, last_used_at, credential_sealed) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![p.id, p.label, p.created_at, p.last_used_at, seal_text(key, p.credential_json.as_bytes())?],
        )?;
    }
    Ok(())
}
