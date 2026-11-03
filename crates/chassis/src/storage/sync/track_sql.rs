//! The SQL half of [`SyncCollection::table`](super::SyncCollection::table):
//! installing the triggers, seeding rows that exist already, and turning the
//! marks of one write into change-log rows.
//!
//! **Two traps, both met by Habits (docs/LOCAL_DB_DESIGN.md).**
//! - A mark must not be `INSERT OR IGNORE`: inside a trigger the conflict
//!   rule of the OUTER statement wins, and a foreign key's cascade then fails
//!   on the second mark of one key. The mark skips a key already marked with
//!   a `WHERE key NOT IN (...)` instead, which is idempotent in every context.
//! - Rows that exist before the triggers do are seeded once, through
//!   [`backfill`](super::backfill), not by an update that fires nothing.

use std::collections::BTreeMap;

use rusqlite::{OptionalExtension, Transaction};

use super::SyncCollection;
use super::backfill::backfill;
use super::ddl::SHARED_SCOPE;
use super::track::Tracking;
use super::tx::SyncWrite;
use crate::core::error::Error;
use crate::storage::db::{meta_get, meta_set};

/// Prefix of every trigger the kit installs; they are dropped and rebuilt at
/// each start, so the declaration is the only truth.
const TRIGGER_PREFIX: &str = "chassis_sync_trg_";

/// `chassis_meta` key that says the collection's existing rows were seeded.
fn seeded_key(collection: &str) -> String {
    format!("sync.seeded.{collection}")
}

/// Drop and recreate the triggers of every tracked collection, then seed the
/// rows that existed before the first time. Runs after the app's migrations.
pub(crate) fn install(tx: &Transaction, collections: &[SyncCollection]) -> Result<(), Error> {
    drop_triggers(tx)?;
    for c in collections {
        let Some(t) = c.tracking() else { continue };
        check_columns(tx, c.name(), t)?;
        for (table, column) in tables(t) {
            for ddl in trigger_ddl(c.name(), table, column) {
                tx.execute_batch(&ddl)?;
            }
        }
        seed(tx, c.name(), t)?;
    }
    Ok(())
}

/// `(table, column holding the record's key)`, the record's own table first.
fn tables(t: &Tracking) -> Vec<(&str, &str)> {
    let own = (t.table.as_str(), t.key_column.as_str());
    let kids = t.children.iter().map(|(a, b)| (a.as_str(), b.as_str()));
    std::iter::once(own).chain(kids).collect()
}

fn drop_triggers(tx: &Transaction) -> Result<(), Error> {
    let mut stmt = tx.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE ?1 ESCAPE '\\'",
    )?;
    let like = format!("{}%", TRIGGER_PREFIX.replace('_', "\\_"));
    let names: Vec<String> = stmt
        .query_map([like], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    for n in names {
        tx.execute_batch(&format!("DROP TRIGGER \"{n}\""))?;
    }
    Ok(())
}

/// A declared table or column that the schema lacks is a start error that
/// names it, not a trigger that fails at the first write.
fn check_columns(tx: &Transaction, collection: &str, t: &Tracking) -> Result<(), Error> {
    let own = format!("\"{}\", \"{}\"", t.key_column, t.rev_column);
    let checks = std::iter::once((t.table.as_str(), own)).chain(
        t.children
            .iter()
            .map(|(tb, col)| (tb.as_str(), format!("\"{col}\""))),
    );
    for (table, columns) in checks {
        tx.prepare(&format!("SELECT {columns} FROM \"{table}\" LIMIT 0"))
            .map_err(|e| {
                Error::config(
                    format!("sync collection `{collection}`: table `{table}` does not have what the declaration names ({e})"),
                    "check the table and column names in SyncCollection::table / also / rev_column, and that the migration that creates them ran",
                )
            })?;
    }
    Ok(())
}

fn trigger_ddl(collection: &str, table: &str, column: &str) -> Vec<String> {
    let mark = |keys: &str| {
        format!(
            "INSERT INTO chassis_sync_dirty SELECT '{collection}', k FROM ({keys}) \
             WHERE k NOT IN (SELECT key FROM chassis_sync_dirty WHERE collection = '{collection}');"
        )
    };
    let (new, old) = (
        format!("SELECT CAST(NEW.\"{column}\" AS TEXT) AS k"),
        format!("SELECT CAST(OLD.\"{column}\" AS TEXT) AS k"),
    );
    let both = format!("{old} UNION SELECT CAST(NEW.\"{column}\" AS TEXT)");
    [("ins", "INSERT", new), ("upd", "UPDATE", both), ("del", "DELETE", old)]
        .into_iter()
        .map(|(tag, event, keys)| {
            format!(
                "CREATE TRIGGER \"{TRIGGER_PREFIX}{collection}_{table}_{tag}\" AFTER {event} ON \"{table}\" BEGIN {} END;",
                mark(&keys)
            )
        })
        .collect()
}

/// Record the rows that are in the collection now, once per file: the
/// change log has never heard of them. Keys already known stay untouched.
fn seed(tx: &Transaction, collection: &str, t: &Tracking) -> Result<(), Error> {
    if meta_get(tx, &seeded_key(collection))?.is_some() {
        return Ok(());
    }
    let live = t.live.as_deref().unwrap_or("1");
    let sql = format!(
        "SELECT CAST(\"{}\" AS TEXT), CAST(\"{}\" AS INTEGER) FROM \"{}\" WHERE ({live})",
        t.key_column, t.rev_column, t.table
    );
    let mut stmt = tx.prepare(&sql)?;
    let rows: Vec<(String, u64)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get::<_, i64>(1)?.max(0) as u64)))?
        .collect::<Result<_, _>>()?;
    drop(stmt);
    let n = backfill(tx, collection, rows)?;
    meta_set(tx, &seeded_key(collection), "1")?;
    tracing::info!(
        collection,
        recorded = n,
        "sync: existing rows seeded into the change log"
    );
    Ok(())
}

/// Turn every mark of this transaction into a change-log row and clear the
/// marks. Returns how many changes were recorded.
pub(crate) fn flush(tx: &Transaction, collections: &[SyncCollection]) -> Result<usize, Error> {
    let marks = marked(tx)?;
    if marks.is_empty() {
        return Ok(0);
    }
    let by_name: BTreeMap<&str, &Tracking> = collections
        .iter()
        .filter_map(|c| c.tracking().map(|t| (c.name(), t)))
        .collect();
    let mut recorded = 0;
    for (collection, key) in &marks {
        let Some(t) = by_name.get(collection.as_str()) else {
            tracing::warn!(
                collection,
                key,
                "sync: a mark of a collection that is no longer declared was dropped"
            );
            continue;
        };
        match state_of(tx, collection, t, key)? {
            (rev, true) => tx.sync_upsert(collection, key, rev)?,
            (rev, false) => tx.sync_delete(collection, key, rev)?,
        };
        recorded += 1;
    }
    tx.execute("DELETE FROM chassis_sync_dirty", [])?;
    Ok(recorded)
}

fn marked(tx: &Transaction) -> Result<Vec<(String, String)>, Error> {
    let mut stmt = tx.prepare_cached(
        "SELECT collection, key FROM chassis_sync_dirty ORDER BY collection, key",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// `(revision, in the collection)` of the record now. A purged row has no
/// revision left: its tombstone takes the next one after what the log held.
fn state_of(
    tx: &Transaction,
    collection: &str,
    t: &Tracking,
    key: &str,
) -> Result<(u64, bool), Error> {
    let live = t.live.as_deref().unwrap_or("1");
    let sql = format!(
        "SELECT CAST(\"{}\" AS INTEGER), ({live}) FROM \"{}\" WHERE \"{}\" = ?1",
        t.rev_column, t.table, t.key_column
    );
    let row: Option<(i64, bool)> = tx
        .query_row(&sql, [key], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()?;
    if let Some((rev, live)) = row {
        return Ok((rev.max(0) as u64, live));
    }
    let last: Option<i64> = tx
        .query_row(
            "SELECT rev FROM chassis_sync WHERE collection = ?1 AND scope = ?2 AND key = ?3",
            [collection, SHARED_SCOPE, key],
            |r| r.get(0),
        )
        .optional()?;
    Ok((last.map_or(1, |r| r.max(0) as u64 + 1), false))
}
