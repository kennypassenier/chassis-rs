//! `tx.sync_upsert` and `tx.sync_delete`: recording a change in the same
//! transaction as the app's own write, so a change can never be missed or
//! reported without having happened.
//!
//! The single writer (`BEGIN IMMEDIATE`) makes `seq` commit in order, so a
//! cursor never skips a late commit.

use rusqlite::Transaction;

use super::ddl::{META_SEQ, SHARED_SCOPE};
use crate::core::error::Error;
use crate::shell::time::now_epoch;
use crate::storage::db::{meta_get, meta_set};

/// The change-log calls on a write transaction of the app database. Import
/// the trait where the app writes:
///
/// ```text
/// app_db.write(|tx| {
///     tx.execute("INSERT INTO dishes …", params)?;
///     tx.sync_upsert("dishes", &id, rev)?;   // same transaction
///     Ok(())
/// })
/// ```
pub trait SyncWrite {
    /// The item `key` of `collection` is new or changed at `rev`; every
    /// login reads it (a [`shared`](super::SyncCollection::shared)
    /// collection). Returns the change's sequence number.
    fn sync_upsert(&self, collection: &str, key: &str, rev: u64) -> Result<u64, Error>;

    /// The item is gone; leaves a tombstone until retention removes it.
    fn sync_delete(&self, collection: &str, key: &str, rev: u64) -> Result<u64, Error>;

    /// As [`SyncWrite::sync_upsert`], for the item of one login
    /// ([`login_scope`](crate::storage::prefs_api::login_scope) of the caller).
    fn sync_upsert_for(
        &self,
        collection: &str,
        scope: &str,
        key: &str,
        rev: u64,
    ) -> Result<u64, Error>;

    /// As [`SyncWrite::sync_delete`], for the item of one login.
    fn sync_delete_for(
        &self,
        collection: &str,
        scope: &str,
        key: &str,
        rev: u64,
    ) -> Result<u64, Error>;
}

impl SyncWrite for Transaction<'_> {
    fn sync_upsert(&self, collection: &str, key: &str, rev: u64) -> Result<u64, Error> {
        record(self, collection, SHARED_SCOPE, key, rev, false)
    }

    fn sync_delete(&self, collection: &str, key: &str, rev: u64) -> Result<u64, Error> {
        record(self, collection, SHARED_SCOPE, key, rev, true)
    }

    fn sync_upsert_for(
        &self,
        collection: &str,
        scope: &str,
        key: &str,
        rev: u64,
    ) -> Result<u64, Error> {
        record(self, collection, scope, key, rev, false)
    }

    fn sync_delete_for(
        &self,
        collection: &str,
        scope: &str,
        key: &str,
        rev: u64,
    ) -> Result<u64, Error> {
        record(self, collection, scope, key, rev, true)
    }
}

/// Take the next value of the file's counter and replace the item's row.
pub(super) fn record(
    tx: &Transaction,
    collection: &str,
    scope: &str,
    key: &str,
    rev: u64,
    deleted: bool,
) -> Result<u64, Error> {
    if collection.is_empty() || scope.is_empty() || key.is_empty() {
        return Err(Error::invalid(
            "a sync change needs a collection, a scope and a key",
            "pass the collection's name and the item's key; they are never empty",
        ));
    }
    let rev = i64::try_from(rev).map_err(|_| {
        Error::invalid(
            format!("revision {rev} of `{collection}/{key}` does not fit the change log"),
            "revisions count up from 1; this one is beyond 2^63",
        )
    })?;
    let seq = next_seq(tx)?;
    tx.execute(
        "INSERT INTO chassis_sync (collection, scope, key, seq, rev, deleted, changed_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
         ON CONFLICT(collection, scope, key) DO UPDATE SET \
         seq = excluded.seq, rev = excluded.rev, deleted = excluded.deleted, \
         changed_at = excluded.changed_at",
        rusqlite::params![
            collection,
            scope,
            key,
            seq,
            rev,
            i64::from(deleted),
            now_epoch() as i64
        ],
    )?;
    Ok(seq as u64)
}

/// The per-file counter in `chassis_meta`, read and bumped inside the
/// caller's transaction (so a rolled-back change leaves no gap that matters
/// and no value is handed out twice).
fn next_seq(tx: &Transaction) -> Result<i64, Error> {
    let current: i64 = meta_get(tx, META_SEQ)?
        .map(|v| {
            v.parse().map_err(|_| {
                Error::internal(
                    format!("the sync counter `{v}` in chassis_meta is not a number"),
                    "restore the app database from a backup; do not edit chassis_meta",
                )
            })
        })
        .transpose()?
        .unwrap_or(0);
    let next = current + 1;
    meta_set(tx, META_SEQ, &next.to_string())?;
    Ok(next)
}
