//! The `chassis_sync` table and the `chassis_meta` keys the change log uses.
//!
//! One row per `(collection, scope, key)` ever seen and not yet pruned: the
//! newest change of that item. A delete leaves a tombstone row
//! (`deleted = 1`); an upsert after it turns the row live again. So the table
//! never holds more than one row per item, and holds no copy of the data.
//!
//! `chassis_sync_dirty` holds the keys that triggers of a
//! [`table`](super::SyncCollection::table) collection marked in the open
//! write; `AppDb::write` turns the marks into rows of `chassis_sync` before
//! it commits.
//!
//! The DDL is idempotent and runs every time the app file opens, BEFORE the
//! app's migrations (and so before its one-time import), so a migration or
//! the import may already call `sync_upsert` or [`backfill`](super::backfill).

use rusqlite::Connection;

use crate::core::error::Error;
use crate::storage::db::META_DDL;

/// Created with the app file; every statement is `IF NOT EXISTS`.
pub(crate) const SYNC_DDL: &str = "
CREATE TABLE IF NOT EXISTS chassis_sync (
    collection TEXT NOT NULL,
    scope      TEXT NOT NULL,
    key        TEXT NOT NULL,
    seq        INTEGER NOT NULL,
    rev        INTEGER NOT NULL,
    deleted    INTEGER NOT NULL DEFAULT 0,
    changed_at INTEGER NOT NULL,
    PRIMARY KEY (collection, scope, key)
) STRICT;
CREATE INDEX IF NOT EXISTS chassis_sync_by_seq ON chassis_sync (collection, seq);
CREATE TABLE IF NOT EXISTS chassis_sync_dirty (
    collection TEXT NOT NULL,
    key        TEXT NOT NULL,
    PRIMARY KEY (collection, key)
) STRICT, WITHOUT ROWID;
";

/// Create the change log's tables on `conn` (and the `chassis_meta` table
/// its counter lives in), for an app's unit test that works on a plain
/// in-memory [`Connection`] instead of an [`AppDb`](crate::storage::AppDb).
/// Idempotent, like the kit's own open.
///
/// ```
/// let conn = rusqlite::Connection::open_in_memory().unwrap();
/// chassis::storage::sync::create_tables(&conn).unwrap();
/// ```
pub fn create_tables(conn: &Connection) -> Result<(), Error> {
    conn.execute_batch(META_DDL)?;
    conn.execute_batch(SYNC_DDL)?;
    Ok(())
}

/// The scope of a row every login may read.
pub(crate) const SHARED_SCOPE: &str = "shared";

/// `chassis_meta` key of the per-file counter every change takes the next
/// value of; one counter for the whole file, so `seq` is a total order.
pub(crate) const META_SEQ: &str = "sync.seq";

/// `chassis_meta` key of a collection's floor: the highest `seq` retention
/// removed. A cursor below it cannot be served.
pub(crate) fn floor_key(collection: &str) -> String {
    format!("sync.floor.{collection}")
}
