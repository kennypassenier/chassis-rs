//! The kit database's clients table: load and save a [`ClientsFile`], with
//! the token and the declared field values sealed per field. Its own module
//! because the sealing and the diff-by-id write belong to this table only.

use std::collections::{BTreeMap, BTreeSet};

use rusqlite::Transaction;

use super::KitDb;
use super::seal::{open_text, seal_text};
use crate::core::clients::{CLIENTS_FORMAT, Client, ClientsFile};
use crate::core::crypto::Key;
use crate::core::error::Error;

impl KitDb {
    pub(crate) fn load_clients(&self) -> Result<ClientsFile, Error> {
        let key = self.key.clone();
        self.db.read_blocking(|c| {
            let mut stmt = c.prepare(
                "SELECT id, name, token_sealed, issued_at, revoked_at, last_used_at, uses, fields_sealed \
                 FROM kit_clients ORDER BY rowid",
            )?;
            let mut rows = stmt.query([])?;
            let mut clients = Vec::new();
            while let Some(r) = rows.next()? {
                let token: Option<String> = r.get(2)?;
                let fields: Option<String> = r.get(7)?;
                let token = match token {
                    Some(t) => Some(
                        String::from_utf8(open_text(&key, &t, "a client's token")?).map_err(|_| {
                            Error::config("a client's token is not text", "restore the kit database from a backup")
                        })?,
                    ),
                    None => None,
                };
                let fields: BTreeMap<String, String> = match fields {
                    Some(f) => serde_json::from_slice(&open_text(&key, &f, "a client's fields")?)
                        .map_err(|e| Error::config(format!("a client's fields do not parse: {e}"), "restore the kit database from a backup"))?,
                    None => BTreeMap::new(),
                };
                let mut client = Client::adopted(
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    String::new(),
                    r.get::<_, String>(3)?,
                );
                client.token = token;
                client.revoked_at = r.get(4)?;
                client.last_used_at = r.get(5)?;
                client.uses = r.get::<_, i64>(6)?.max(0) as u64;
                client.fields = fields;
                clients.push(client);
            }
            Ok(ClientsFile {
                v: CLIENTS_FORMAT,
                clients,
            })
        })
    }

    pub(crate) fn save_clients(&self, file: &ClientsFile) -> Result<(), Error> {
        let key = self.key.clone();
        let file = file.clone();
        self.db
            .write_blocking(move |tx| write_clients(tx, &key, &file))
    }
}

fn write_clients(tx: &Transaction, key: &Key, file: &ClientsFile) -> Result<(), Error> {
    let existing: BTreeSet<String> = tx
        .prepare("SELECT id FROM kit_clients")?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let mut keep = BTreeSet::new();
    for c in &file.clients {
        keep.insert(c.id.clone());
        let token = c
            .token
            .as_deref()
            .map(|t| seal_text(key, t.as_bytes()))
            .transpose()?;
        let fields = if c.fields.is_empty() {
            None
        } else {
            Some(seal_text(
                key,
                &serde_json::to_vec(&c.fields).expect("fields serialise"),
            )?)
        };
        tx.execute(
            "INSERT INTO kit_clients (id, name, token_sealed, issued_at, revoked_at, last_used_at, uses, fields_sealed) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) \
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, token_sealed = excluded.token_sealed, \
               issued_at = excluded.issued_at, revoked_at = excluded.revoked_at, \
               last_used_at = excluded.last_used_at, uses = excluded.uses, fields_sealed = excluded.fields_sealed",
            rusqlite::params![c.id, c.name, token, c.issued_at, c.revoked_at, c.last_used_at, c.uses as i64, fields],
        )?;
    }
    for gone in existing.difference(&keep) {
        tx.execute("DELETE FROM kit_clients WHERE id = ?1", [gone])?;
    }
    Ok(())
}

// Imports INSERT (no upsert): a duplicate id in an old file is a failure.
pub(super) fn insert_clients(tx: &Transaction, key: &Key, file: &ClientsFile) -> Result<(), Error> {
    for c in &file.clients {
        let token = c
            .token
            .as_deref()
            .map(|t| seal_text(key, t.as_bytes()))
            .transpose()?;
        let fields = if c.fields.is_empty() {
            None
        } else {
            Some(seal_text(
                key,
                &serde_json::to_vec(&c.fields).expect("fields serialise"),
            )?)
        };
        tx.execute(
            "INSERT INTO kit_clients (id, name, token_sealed, issued_at, revoked_at, last_used_at, uses, fields_sealed) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![c.id, c.name, token, c.issued_at, c.revoked_at, c.last_used_at, c.uses as i64, fields],
        )?;
    }
    Ok(())
}
