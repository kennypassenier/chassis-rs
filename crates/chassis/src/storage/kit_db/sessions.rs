//! The kit database's sessions table: load, save and prune sessions. Only
//! the SHA-256 of a cookie is stored, so nothing here is sealed. Its own
//! module because sessions are the only rows the kit removes by itself.

use std::collections::BTreeSet;

use rusqlite::Transaction;

use super::KitDb;
use crate::core::error::Error;
use crate::core::session::{SESSIONS_FORMAT, Session, SessionsFile};

impl KitDb {
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

pub(super) fn insert_sessions(tx: &Transaction, file: &SessionsFile) -> Result<(), Error> {
    for s in &file.sessions {
        tx.execute(
            "INSERT INTO kit_sessions (id_hash, created_at, expires_at, remember) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![s.id_hash, s.created_at as i64, s.expires_at as i64, i64::from(s.remember)],
        )?;
    }
    Ok(())
}
