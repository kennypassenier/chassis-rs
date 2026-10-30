//! The kit's own file, `<name>-kit.db`: clients, sessions and passkeys.
//!
//! These used to be three sealed JSON files (`clients.json.enc`,
//! `sessions.json.enc`, `passkeys.json.enc`). They live here now, one table
//! each, and the secrets stay sealed FIELD BY FIELD with the same crypto and
//! the same `<P>_SECRET_KEY`: a client's token and its declared field values,
//! a passkey's credential. Ids, names, timestamps and the SHA-256 of a
//! session cookie are not secrets and are plain columns, so the file can be
//! inspected without the key.
//!
//! This file is the kit's alone. Nothing here is reachable from the Storage
//! page: there is no kind for it, no delete and no compact (`AppDb` is a
//! different type, and `docs/STORAGE_DESIGN.md` decision 2 makes that the
//! rule). The only thing that removes rows from it is the kit itself, and
//! only sessions that expired by their own definition.
//!
//! The first start after the upgrade moves the old files in, once, in ONE
//! transaction ([`KitDb::import_legacy`]): a failure writes nothing and the
//! kit keeps running on the old files; a success verifies the counts and
//! renames the old files to `*.json.enc.migrated`.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use rusqlite::Transaction;

use super::db::{Db, Migration, meta_get, meta_set};
use crate::core::clients::{CLIENTS_FORMAT, Client, ClientsFile};
use crate::core::crypto::{Key, NONCE_LEN, Sealed, open, seal};
use crate::core::error::Error;
use crate::core::session::{SESSIONS_FORMAT, Session, SessionsFile};
use crate::shell::store::EncryptedFile;

/// `<name>-kit.db`.
pub(crate) fn kit_file_name(app: &str) -> String {
    format!("{app}-kit.db")
}

/// The kit's schema. Append only.
pub(crate) fn kit_migrations() -> Vec<Migration> {
    vec![
        Migration::sql(
            "CREATE TABLE kit_clients (
            id             TEXT NOT NULL UNIQUE,
            name           TEXT NOT NULL,
            token_sealed   TEXT,
            issued_at      TEXT NOT NULL,
            revoked_at     TEXT,
            last_used_at   TEXT,
            uses           INTEGER NOT NULL,
            fields_sealed  TEXT
         ) STRICT;
         CREATE TABLE kit_sessions (
            id_hash     TEXT PRIMARY KEY,
            created_at  INTEGER NOT NULL,
            expires_at  INTEGER NOT NULL,
            remember    INTEGER NOT NULL
         ) STRICT;
         CREATE INDEX kit_sessions_expiry ON kit_sessions (expires_at);
         CREATE TABLE kit_passkeys (
            id                TEXT NOT NULL UNIQUE,
            label             TEXT NOT NULL,
            created_at        TEXT NOT NULL,
            last_used_at      TEXT,
            credential_sealed TEXT NOT NULL
         ) STRICT;",
        ),
        // 3.15.0: the notification outbox (storage/outbox.rs).
        super::outbox::migration(),
    ]
}

/// How many migrations the kit file knows, for `--check`.
pub(crate) fn kit_schema_version() -> usize {
    kit_migrations().len()
}

fn seal_text(key: &Key, plain: &[u8]) -> Result<String, Error> {
    let mut nonce = [0u8; NONCE_LEN];
    getrandom::fill(&mut nonce)
        .map_err(|e| Error::internal(format!("random nonce: {e}"), "report this"))?;
    let sealed = seal(key, &nonce, plain)?;
    serde_json::to_string(&sealed)
        .map_err(|e| Error::internal(format!("serialise: {e}"), "report this"))
}

fn open_text(key: &Key, text: &str, what: &str) -> Result<Vec<u8>, Error> {
    let sealed: Sealed = serde_json::from_str(text).map_err(|e| {
        Error::config(
            format!("a sealed field of {what} in the kit database is not an envelope: {e}"),
            "the kit database is corrupt; restore it from the last backup or pre-update copy",
        )
    })?;
    open(key, &sealed, what)
}

/// One passkey as the table keeps it; the credential is the serialised
/// WebAuthn credential, sealed at rest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PasskeyRow {
    pub id: String,
    pub label: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
    pub credential_json: String,
}

/// What the one-time import should look at.
pub(crate) struct ImportPlan {
    pub state_dir: PathBuf,
    /// The kit builds the clients store itself (no project store, not open).
    pub clients: bool,
    /// `sessions.json.enc`, or `sessions.open.json.enc` for an open run.
    pub sessions_file: &'static str,
    /// The passkeys feature is compiled in and its page is on.
    pub passkeys: bool,
}

/// The kit's file with the key that seals its secrets.
#[derive(Clone)]
pub(crate) struct KitDb {
    db: Db,
    key: Key,
}

impl KitDb {
    pub(crate) fn new(db: Db, key: Key) -> Self {
        KitDb { db, key }
    }

    // ---- clients -----------------------------------------------------------

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

    // ---- sessions ------------------------------------------------------------

    pub(crate) fn load_sessions(&self) -> Result<SessionsFile, Error> {
        self.db.read_blocking(|c| {
            let mut stmt = c.prepare(
                "SELECT id_hash, created_at, expires_at, remember FROM kit_sessions ORDER BY rowid",
            )?;
            let sessions = stmt
                .query_map([], |r| {
                    Ok(Session {
                        id_hash: r.get(0)?,
                        created_at: r.get::<_, i64>(1)?.max(0) as u64,
                        expires_at: r.get::<_, i64>(2)?.max(0) as u64,
                        remember: r.get::<_, i64>(3)? != 0,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(SessionsFile {
                v: SESSIONS_FORMAT,
                sessions,
            })
        })
    }

    pub(crate) async fn save_sessions(&self, file: SessionsFile) -> Result<(), Error> {
        self.db.write(move |tx| write_sessions(tx, &file)).await
    }

    /// Sessions that expired by their own definition; the only rows the kit
    /// removes from this file on its own. Returns how many.
    pub(crate) fn prune_expired_sessions(&self, now: u64) -> Result<u64, Error> {
        self.db.write_blocking(|tx| {
            Ok(tx.execute(
                "DELETE FROM kit_sessions WHERE expires_at <= ?1",
                [now as i64],
            )? as u64)
        })
    }

    // ---- passkeys --------------------------------------------------------------

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

    // ---- the one-time import ---------------------------------------------------

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
        super::app_db::rename_migrated(&renames);
        if moved > 0 {
            tracing::info!(
                files = moved,
                "kit stores moved into the kit database; the old files are renamed *.migrated"
            );
        }
        Ok(moved)
    }

    // ---- rekey ---------------------------------------------------------------------

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

fn write_sessions(tx: &Transaction, file: &SessionsFile) -> Result<(), Error> {
    let existing: BTreeSet<String> = tx
        .prepare("SELECT id_hash FROM kit_sessions")?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let mut keep = BTreeSet::new();
    for s in &file.sessions {
        keep.insert(s.id_hash.clone());
        tx.execute(
            "INSERT INTO kit_sessions (id_hash, created_at, expires_at, remember) VALUES (?1, ?2, ?3, ?4) \
             ON CONFLICT(id_hash) DO UPDATE SET expires_at = excluded.expires_at, remember = excluded.remember",
            rusqlite::params![s.id_hash, s.created_at as i64, s.expires_at as i64, i64::from(s.remember)],
        )?;
    }
    for gone in existing.difference(&keep) {
        tx.execute("DELETE FROM kit_sessions WHERE id_hash = ?1", [gone])?;
    }
    Ok(())
}

#[cfg_attr(not(feature = "passkeys"), allow(dead_code))]
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

// Imports INSERT (no upsert): a duplicate id in an old file is a failure.
fn insert_clients(tx: &Transaction, key: &Key, file: &ClientsFile) -> Result<(), Error> {
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

fn insert_sessions(tx: &Transaction, file: &SessionsFile) -> Result<(), Error> {
    for s in &file.sessions {
        tx.execute(
            "INSERT INTO kit_sessions (id_hash, created_at, expires_at, remember) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![s.id_hash, s.created_at as i64, s.expires_at as i64, i64::from(s.remember)],
        )?;
    }
    Ok(())
}

#[cfg_attr(not(feature = "passkeys"), allow(dead_code))]
fn insert_passkeys(tx: &Transaction, key: &Key, rows: &[PasskeyRow]) -> Result<(), Error> {
    for p in rows {
        tx.execute(
            "INSERT INTO kit_passkeys (id, label, created_at, last_used_at, credential_sealed) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![p.id, p.label, p.created_at, p.last_used_at, seal_text(key, p.credential_json.as_bytes())?],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> Key {
        Key::from_bytes([5u8; 32])
    }

    fn kit(dir: &Path) -> KitDb {
        KitDb::new(
            Db::open(&dir.join("svc-kit.db"), &kit_migrations()).unwrap(),
            key(),
        )
    }

    fn clients() -> ClientsFile {
        let mut f = ClientsFile::default();
        f.issue_with_fields(
            "ha",
            "id-1".into(),
            "very-secret-token-1".into(),
            "2026-09-05T07:00:00Z",
            [("calendar".to_string(), "private-calendar-id".to_string())].into(),
        )
        .unwrap();
        f.issue_with_fields(
            "other",
            "id-2".into(),
            "very-secret-token-2".into(),
            "2026-09-05T07:01:00Z",
            Default::default(),
        )
        .unwrap();
        f.revoke("id-2", "2026-09-06T00:00:00Z").unwrap();
        f
    }

    fn raw_bytes(dir: &Path) -> Vec<u8> {
        let mut all = Vec::new();
        for f in ["svc-kit.db", "svc-kit.db-wal"] {
            all.extend(std::fs::read(dir.join(f)).unwrap_or_default());
        }
        all
    }

    fn contains(hay: &[u8], needle: &str) -> bool {
        hay.windows(needle.len()).any(|w| w == needle.as_bytes())
    }

    #[test]
    fn clients_round_trip_with_tokens_and_fields_sealed_but_names_plain() {
        let dir = tempfile::tempdir().unwrap();
        let k = kit(dir.path());
        k.save_clients(&clients()).unwrap();
        let back = k.load_clients().unwrap();
        assert_eq!(back, clients());
        assert!(
            back.get("id-2").unwrap().token.is_none(),
            "a revoked client has no secret on disk"
        );
        let raw = raw_bytes(dir.path());
        assert!(
            !contains(&raw, "very-secret-token-1"),
            "the token never touches disk in plain"
        );
        assert!(
            !contains(&raw, "private-calendar-id"),
            "nor does a field value"
        );
        assert!(
            contains(&raw, "other"),
            "a name is a plain column: the file can be read without the key"
        );
        // A wrong key cannot read the secrets back.
        let db = Db::open(&dir.path().join("svc-kit.db"), &kit_migrations()).unwrap();
        let wrong = KitDb::new(db, Key::from_bytes([6u8; 32]));
        let err = wrong.load_clients().unwrap_err();
        assert!(err.remedy.contains("rekey"), "{err}");
    }

    #[test]
    fn a_save_replaces_the_set_inserts_updates_and_removes() {
        let dir = tempfile::tempdir().unwrap();
        let k = kit(dir.path());
        let mut f = clients();
        k.save_clients(&f).unwrap();
        f.touch("id-1", "2026-09-07T00:00:00Z");
        f.delete("id-2").unwrap();
        k.save_clients(&f).unwrap();
        let back = k.load_clients().unwrap();
        assert_eq!(back.clients.len(), 1);
        assert_eq!(back.get("id-1").unwrap().uses, 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn sessions_round_trip_and_only_expired_ones_are_pruned() {
        let dir = tempfile::tempdir().unwrap();
        let k = kit(dir.path());
        let mut f = SessionsFile::default();
        f.create("live", 1_000, 5_000, false);
        f.create("kept", 1_000, 9_000, true);
        f.create("dead", 1_000, 100, false);
        k.save_sessions(f.clone()).await.unwrap();
        assert_eq!(k.load_sessions().unwrap(), f);
        assert!(
            !contains(&raw_bytes(dir.path()), "live"),
            "only the hash is stored"
        );
        assert_eq!(
            k.prune_expired_sessions(2_000).unwrap(),
            1,
            "exactly the expired one"
        );
        let left = k.load_sessions().unwrap();
        assert_eq!(left.sessions.len(), 2);
        assert!(left.is_live("live", 2_000) && left.is_live("kept", 2_000));
        assert_eq!(k.prune_expired_sessions(2_000).unwrap(), 0);
    }

    #[test]
    fn passkey_credentials_are_sealed_and_ids_are_plain() {
        let dir = tempfile::tempdir().unwrap();
        let k = kit(dir.path());
        let rows = vec![PasskeyRow {
            id: "pk-1".into(),
            label: "laptop".into(),
            created_at: "2026-09-05T07:00:00Z".into(),
            last_used_at: None,
            credential_json: "{\"cred\":\"top-secret-credential\"}".into(),
        }];
        k.save_passkeys(&rows).unwrap();
        assert_eq!(k.load_passkeys().unwrap(), rows);
        let raw = raw_bytes(dir.path());
        assert!(!contains(&raw, "top-secret-credential"));
        assert!(contains(&raw, "laptop"));
        k.save_passkeys(&[]).unwrap();
        assert!(k.load_passkeys().unwrap().is_empty());
    }

    fn write_legacy(dir: &Path) {
        EncryptedFile::new(dir.join("clients.json.enc"), key(), "clients")
            .save(&clients())
            .unwrap();
        let mut s = SessionsFile::default();
        s.create("one", 1_000, 5_000, false);
        s.create("two", 1_000, 5_000, true);
        EncryptedFile::new(dir.join("sessions.json.enc"), key(), "sessions")
            .save(&s)
            .unwrap();
    }

    fn plan(dir: &Path) -> ImportPlan {
        ImportPlan {
            state_dir: dir.to_path_buf(),
            clients: true,
            sessions_file: "sessions.json.enc",
            passkeys: false,
        }
    }

    #[test]
    fn the_import_moves_the_old_files_in_verifies_counts_and_renames_them() {
        let dir = tempfile::tempdir().unwrap();
        write_legacy(dir.path());
        let k = kit(dir.path());
        assert_eq!(k.import_legacy(&plan(dir.path())).unwrap(), 2);
        assert_eq!(k.load_clients().unwrap(), clients());
        assert_eq!(k.load_sessions().unwrap().sessions.len(), 2);
        assert!(!dir.path().join("clients.json.enc").exists());
        assert!(dir.path().join("clients.json.enc.migrated").exists());
        assert!(dir.path().join("sessions.json.enc.migrated").exists());
        // The renamed copy is still sealed: it keeps working as a backup.
        assert!(
            EncryptedFile::new(dir.path().join("clients.json.enc.migrated"), key(), "c")
                .load::<ClientsFile>()
                .unwrap()
                .is_some()
        );
    }

    /// The marker makes the import idempotent: a restored old file cannot
    /// overwrite newer data, and a fresh install marks itself done.
    #[test]
    fn a_second_import_does_nothing_even_if_an_old_file_comes_back() {
        let dir = tempfile::tempdir().unwrap();
        write_legacy(dir.path());
        let k = kit(dir.path());
        k.import_legacy(&plan(dir.path())).unwrap();
        let mut f = k.load_clients().unwrap();
        f.delete("id-1").unwrap();
        k.save_clients(&f).unwrap();
        write_legacy(dir.path()); // an old file restored by hand
        assert_eq!(k.import_legacy(&plan(dir.path())).unwrap(), 0);
        assert_eq!(
            k.load_clients().unwrap().clients.len(),
            1,
            "newer data kept"
        );
        assert!(
            dir.path().join("clients.json.enc").exists(),
            "and nothing renamed"
        );

        // Fresh install: no files, marker set, a file appearing later is ignored.
        let fresh = tempfile::tempdir().unwrap();
        let k = kit(fresh.path());
        assert_eq!(k.import_legacy(&plan(fresh.path())).unwrap(), 0);
        write_legacy(fresh.path());
        assert_eq!(k.import_legacy(&plan(fresh.path())).unwrap(), 0);
        assert!(k.load_clients().unwrap().clients.is_empty());
    }

    /// A failure anywhere writes NOTHING anywhere: the sessions that were
    /// fine are rolled back with the clients that were not, no marker is
    /// set, the old files are untouched, and the next try can succeed.
    #[test]
    fn a_failed_import_writes_nothing_and_keeps_the_old_files() {
        let dir = tempfile::tempdir().unwrap();
        write_legacy(dir.path());
        // Corrupt the clients file: two clients with one id.
        let mut bad = clients();
        bad.clients[1].id = "id-1".into();
        EncryptedFile::new(dir.path().join("clients.json.enc"), key(), "clients")
            .save(&bad)
            .unwrap();
        let before = std::fs::read(dir.path().join("clients.json.enc")).unwrap();
        let k = kit(dir.path());
        let err = k.import_legacy(&plan(dir.path())).unwrap_err();
        assert!(
            err.message.contains("UNIQUE") || err.message.contains("database error"),
            "{err}"
        );
        assert!(
            k.load_clients().unwrap().clients.is_empty(),
            "no client was kept"
        );
        assert!(
            k.load_sessions().unwrap().sessions.is_empty(),
            "nor the sessions that were fine"
        );
        assert!(
            dir.path().join("sessions.json.enc").exists(),
            "no old file was renamed"
        );
        assert_eq!(
            std::fs::read(dir.path().join("clients.json.enc")).unwrap(),
            before,
            "and none was touched"
        );
        let marker =
            k.db.read_blocking(|c| meta_get(c, "import.clients"))
                .unwrap();
        assert!(marker.is_none(), "no marker, so the next start retries");
        // Fixed file, next start: it goes through.
        EncryptedFile::new(dir.path().join("clients.json.enc"), key(), "clients")
            .save(&clients())
            .unwrap();
        assert_eq!(k.import_legacy(&plan(dir.path())).unwrap(), 2);
        assert_eq!(k.load_clients().unwrap(), clients());
    }

    #[test]
    fn an_import_with_the_wrong_key_fails_with_the_rekey_remedy_and_writes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        write_legacy(dir.path());
        let db = Db::open(&dir.path().join("svc-kit.db"), &kit_migrations()).unwrap();
        let wrong = KitDb::new(db, Key::from_bytes([1u8; 32]));
        let err = wrong.import_legacy(&plan(dir.path())).unwrap_err();
        assert!(err.remedy.contains("rekey"), "{err}");
        assert!(dir.path().join("clients.json.enc").exists());
    }

    #[test]
    fn an_open_run_imports_its_own_sessions_file_and_not_the_closed_ones() {
        let dir = tempfile::tempdir().unwrap();
        write_legacy(dir.path());
        let mut open_sessions = SessionsFile::default();
        open_sessions.create("o", 1_000, 5_000, false);
        EncryptedFile::new(dir.path().join("sessions.open.json.enc"), key(), "s")
            .save(&open_sessions)
            .unwrap();
        let k = kit(dir.path());
        let open_plan = ImportPlan {
            state_dir: dir.path().to_path_buf(),
            clients: false,
            sessions_file: "sessions.open.json.enc",
            passkeys: false,
        };
        assert_eq!(k.import_legacy(&open_plan).unwrap(), 1);
        assert_eq!(k.load_sessions().unwrap().sessions.len(), 1);
        assert!(
            dir.path().join("clients.json.enc").exists(),
            "closed files untouched"
        );
    }

    #[test]
    fn rekey_reseals_every_field_once_and_a_wrong_old_key_changes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("svc-kit.db");
        let k = kit(dir.path());
        k.save_clients(&clients()).unwrap();
        k.save_passkeys(&[PasskeyRow {
            id: "p".into(),
            label: "l".into(),
            created_at: "t".into(),
            last_used_at: None,
            credential_json: "{}".into(),
        }])
        .unwrap();
        drop(k);
        let new = Key::from_bytes([8u8; 32]);
        // Wrong old key: refused, nothing changed.
        let err = KitDb::rekey(&path, &Key::from_bytes([2u8; 32]), &new).unwrap_err();
        assert!(err.remedy.contains("OLD_SECRET_KEY"), "{err}");
        assert_eq!(
            kit(dir.path()).load_clients().unwrap(),
            clients(),
            "still readable with the old key"
        );
        // Right old key: token (1) + fields (1) + credential (1).
        assert_eq!(KitDb::rekey(&path, &key(), &new).unwrap(), 3);
        let db = Db::open(&path, &kit_migrations()).unwrap();
        let moved = KitDb::new(db.clone(), new);
        assert_eq!(moved.load_clients().unwrap(), clients());
        assert_eq!(moved.load_passkeys().unwrap().len(), 1);
        assert!(
            KitDb::new(db, key()).load_clients().is_err(),
            "the old key no longer opens it"
        );
        assert_eq!(
            KitDb::rekey(&path, &key(), &Key::from_bytes([8u8; 32])).unwrap(),
            0,
            "a rerun is a no-op"
        );
    }

    /// Locks decision 2: the kit's file has no kind, and the schema carries
    /// no table a Storage page could be pointed at by a project's kind (the
    /// kit tables are `kit_*`; `DataKind` refuses `chassis_*` and a kind is
    /// validated only against the APP file, which has no such tables).
    #[test]
    fn the_kit_tables_are_not_in_the_app_file_so_no_kind_can_name_them() {
        let dir = tempfile::tempdir().unwrap();
        let _kit = kit(dir.path());
        let app = crate::storage::AppDb::open(
            &dir.path().join("svc.db"),
            crate::storage::AppDbSpec::default(),
            vec![],
        )
        .unwrap();
        for t in ["kit_clients", "kit_sessions", "kit_passkeys"] {
            let err = crate::storage::AppDb::open_in_memory(
                crate::storage::AppDbSpec::default(),
                vec![crate::storage::DataKind::new("x", "X").table(t)],
            )
            .unwrap_err();
            assert!(err.message.contains("no table"), "{t}: {err}");
            let n: i64 = app
                .read_blocking(|c| {
                    Ok(c.query_row(
                        "SELECT count(*) FROM sqlite_master WHERE name = ?1",
                        [t],
                        |r| r.get(0),
                    )?)
                })
                .unwrap();
            assert_eq!(n, 0, "{t} is not in the app file");
        }
    }
}
