//! Seeding the change log for rows that existed before it did.
//!
//! An app that adopts the local database already holds rows no
//! `sync_upsert` ever saw, so a client's first pull would not list them.
//! [`backfill`] records every such row once. It is meant for an app
//! migration (the change log's table exists before the app's migrations
//! run), for the import, or for [`AppDbSpec::on_open`](crate::storage::AppDbSpec::on_open).

use rusqlite::{OptionalExtension, Transaction};

use super::ddl::SHARED_SCOPE;
use super::tx::record;
use crate::core::error::Error;

/// Record each `(key, rev)` of `collection` as an upsert, unless the change
/// log already has that item. Idempotent: running it again (a migration
/// retried after a crash, a second start) records nothing new, and it never
/// overwrites the row of an item that has changed since (including a
/// tombstone). Returns how many items it recorded.
///
/// ```text
/// Migration::code(|tx| {
///     let rows: Vec<(String, u64)> = /* SELECT id, rev FROM dishes */;
///     chassis::storage::sync::backfill(tx, "dishes", rows)?;
///     Ok(())
/// })
/// ```
pub fn backfill<K: AsRef<str>>(
    tx: &Transaction,
    collection: &str,
    rows: impl IntoIterator<Item = (K, u64)>,
) -> Result<u64, Error> {
    backfill_for(tx, collection, SHARED_SCOPE, rows)
}

/// As [`backfill`], for the items of one login (`scope` is the
/// [`login_scope`](crate::storage::prefs_api::login_scope) of the owner).
pub fn backfill_for<K: AsRef<str>>(
    tx: &Transaction,
    collection: &str,
    scope: &str,
    rows: impl IntoIterator<Item = (K, u64)>,
) -> Result<u64, Error> {
    let mut recorded = 0;
    for (key, rev) in rows {
        let key = key.as_ref();
        let known = tx
            .query_row(
                "SELECT 1 FROM chassis_sync WHERE collection = ?1 AND scope = ?2 AND key = ?3",
                [collection, scope, key],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if !known {
            record(tx, collection, scope, key, rev, false)?;
            recorded += 1;
        }
    }
    Ok(recorded)
}
