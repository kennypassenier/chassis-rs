//! The port the feed reads through, and its default adapter (decision 3).
//!
//! [`SyncSource`] is the port: "changes since a cursor" and "the oldest
//! cursor still served". [`SqliteChangeLog`] is the adapter for apps on the
//! app database: it reads `chassis_sync` and asks the app's [`SyncLoad`] for
//! the current bodies of the keys that changed, in the same read snapshot,
//! so a body is never newer than the revision next to it.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use rusqlite::{Connection, params};
use serde_json::Value as Json;

use super::cursor::Cursor;
use super::ddl::{SHARED_SCOPE, floor_key};
use super::feed::{Delete, Feed, Page, Upsert};
use crate::core::error::Error;
use crate::storage::app_db::AppDb;
use crate::storage::db::meta_get;

/// A boxed future, so the port can be a trait object.
pub type SyncFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Error>> + Send + 'a>>;

/// The port: where a feed comes from. An app that does not keep its data in
/// the app database implements it itself, under the same rules (a monotonic
/// counter and tombstones written atomically with the data), and proves it
/// with the conformance helper.
pub trait SyncSource: Send + Sync {
    /// At most `limit` changes of `collection` after `since` that the login
    /// `scope` may read (its own rows and the shared ones). `None` reads
    /// from the beginning: every live item, no tombstones. Each key appears
    /// at most once, in its newest state.
    fn changes_since<'a>(
        &'a self,
        collection: &'a str,
        scope: &'a str,
        since: Option<Cursor>,
        limit: usize,
    ) -> SyncFuture<'a, Feed>;

    /// The oldest cursor still served: a cursor below it is a [`Feed::Resync`].
    fn floor<'a>(&'a self, collection: &'a str) -> SyncFuture<'a, Cursor>;
}

/// The app's half of [`SqliteChangeLog`]: the current bodies of items.
/// Runs inside the read snapshot of the feed, on its connection.
pub trait SyncLoad: Send + Sync + 'static {
    /// The current JSON body of each of `keys` that still exists. A missing
    /// key is left out of the map (it was deleted since; the delete follows
    /// in a later page).
    fn load(
        &self,
        conn: &Connection,
        collection: &str,
        keys: &[String],
    ) -> Result<HashMap<String, Json>, Error>;
}

/// The feed over the `chassis_sync` table of the app database.
#[derive(Clone)]
pub struct SqliteChangeLog {
    app: AppDb,
    load: Arc<dyn SyncLoad>,
}

impl SqliteChangeLog {
    pub fn new(app: AppDb, load: Arc<dyn SyncLoad>) -> Self {
        SqliteChangeLog { app, load }
    }

    pub(super) fn app(&self) -> &AppDb {
        &self.app
    }
}

impl SyncSource for SqliteChangeLog {
    fn changes_since<'a>(
        &'a self,
        collection: &'a str,
        scope: &'a str,
        since: Option<Cursor>,
        limit: usize,
    ) -> SyncFuture<'a, Feed> {
        let (load, collection, scope) =
            (self.load.clone(), collection.to_string(), scope.to_string());
        Box::pin(async move {
            self.app
                .read(move |c| read_feed(c, load.as_ref(), &collection, &scope, since, limit))
                .await
        })
    }

    fn floor<'a>(&'a self, collection: &'a str) -> SyncFuture<'a, Cursor> {
        let collection = collection.to_string();
        Box::pin(async move { self.app.read(move |c| read_floor(c, &collection)).await })
    }
}

pub(super) fn read_floor(conn: &Connection, collection: &str) -> Result<Cursor, Error> {
    let raw = meta_get(conn, &floor_key(collection))?;
    raw.map(|v| {
        v.parse().map(Cursor::at).map_err(|_| {
            Error::internal(
                format!("the sync floor `{v}` of `{collection}` is not a number"),
                "restore the app database from a backup; do not edit chassis_meta",
            )
        })
    })
    .transpose()
    .map(|c| c.unwrap_or(Cursor::START))
}

/// One feed page in one read snapshot.
fn read_feed(
    conn: &Connection,
    load: &dyn SyncLoad,
    collection: &str,
    scope: &str,
    since: Option<Cursor>,
    limit: usize,
) -> Result<Feed, Error> {
    let snap = conn.unchecked_transaction()?;
    let floor = read_floor(&snap, collection)?;
    // A sweep (a read from the beginning, or its continuation) lists live
    // items only and needs no tombstones, so the floor does not apply.
    let sweep = since.is_none_or(Cursor::is_sweep);
    if !sweep && since.is_some_and(|c| c < floor) {
        return Ok(Feed::Resync { floor });
    }
    let after = since.map_or(0, Cursor::seq);
    let mut rows = read_rows(&snap, collection, scope, after, sweep, limit + 1)?;
    let more = rows.len() > limit;
    rows.truncate(limit);
    let last = rows.last().map_or(after, |r| r.seq);
    let keys: Vec<String> = rows
        .iter()
        .filter(|r| !r.deleted)
        .map(|r| r.key.clone())
        .collect();
    let mut bodies = if keys.is_empty() {
        HashMap::new()
    } else {
        load.load(&snap, collection, &keys)?
    };
    let (mut upserts, mut deletes) = (Vec::new(), Vec::new());
    for r in rows {
        if r.deleted {
            deletes.push(Delete::new(r.key, r.rev));
        } else if let Some(data) = bodies.remove(&r.key) {
            upserts.push(Upsert::new(r.key, r.rev, data));
        }
    }
    let cursor = match (sweep, more) {
        (true, true) => Cursor::sweep_at(last),
        // The end of a sweep: the page now holds everything live, so the
        // position may rise to the floor without skipping a live item.
        (true, false) => Cursor::at(last.max(floor.seq())),
        (false, _) => Cursor::at(last),
    };
    Ok(Feed::Page(Page::new(upserts, deletes, cursor, more)))
}

struct Row {
    key: String,
    seq: u64,
    rev: u64,
    deleted: bool,
}

fn read_rows(
    conn: &Connection,
    collection: &str,
    scope: &str,
    after: u64,
    live_only: bool,
    limit: usize,
) -> Result<Vec<Row>, Error> {
    let mut stmt = conn.prepare_cached(
        "SELECT key, seq, rev, deleted FROM chassis_sync \
         WHERE collection = ?1 AND scope IN (?2, ?3) AND seq > ?4 AND (?5 = 0 OR deleted = 0) \
         ORDER BY seq LIMIT ?6",
    )?;
    let rows = stmt.query_map(
        params![
            collection,
            scope,
            SHARED_SCOPE,
            after as i64,
            i64::from(live_only),
            limit as i64
        ],
        |r| {
            Ok(Row {
                key: r.get(0)?,
                seq: r.get::<_, i64>(1)? as u64,
                rev: r.get::<_, i64>(2)? as u64,
                deleted: r.get::<_, i64>(3)? != 0,
            })
        },
    )?;
    Ok(rows.collect::<Result<_, _>>()?)
}
