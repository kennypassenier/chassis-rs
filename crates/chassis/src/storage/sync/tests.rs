//! Unit tests of the local database's server half: cursor encoding, page
//! limits, one row per key, the floor and the 410, retention, scope
//! filtering, the client-UUID create rules, and the conformance run of the
//! SQLite change log. Run at release only.

use std::collections::HashMap;
use std::sync::Arc;

use rusqlite::{Connection, Transaction};
use serde_json::{Value, json};

use super::conformance::{SourceHarness, assert_conforms};
use super::*;
use crate::core::error::Error;
use crate::storage::{AppDb, AppDbSpec, Migration};

const SCHEMA: &str = "CREATE TABLE items (collection TEXT NOT NULL, id TEXT NOT NULL, rev INTEGER NOT NULL, \
                      PRIMARY KEY (collection, id)) STRICT;";

/// Loads `{id, rev}` bodies from the `items` table of the test schema.
struct ItemLoad;

impl SyncLoad for ItemLoad {
    fn load(
        &self,
        conn: &Connection,
        collection: &str,
        keys: &[String],
    ) -> Result<HashMap<String, Value>, Error> {
        let mut out = HashMap::new();
        for k in keys {
            let rev: Option<i64> = conn
                .query_row(
                    "SELECT rev FROM items WHERE collection = ?1 AND id = ?2",
                    [collection, k],
                    |r| r.get(0),
                )
                .ok();
            if let Some(rev) = rev {
                out.insert(k.clone(), json!({ "id": k, "rev": rev }));
            }
        }
        Ok(out)
    }
}

struct Fixture {
    app: AppDb,
    log: SqliteChangeLog,
}

fn fixture() -> Fixture {
    let app = AppDb::open_in_memory(AppDbSpec::new(vec![Migration::sql(SCHEMA)]), vec![]).unwrap();
    let log = SqliteChangeLog::new(app.clone(), Arc::new(ItemLoad));
    Fixture { app, log }
}

fn put(tx: &Transaction, coll: &str, key: &str, rev: u64) {
    tx.execute(
        "INSERT INTO items (collection, id, rev) VALUES (?1, ?2, ?3) \
         ON CONFLICT(collection, id) DO UPDATE SET rev = excluded.rev",
        rusqlite::params![coll, key, rev as i64],
    )
    .unwrap();
}

impl SourceHarness for Fixture {
    fn source(&self) -> &dyn SyncSource {
        &self.log
    }

    fn upsert<'a>(
        &'a self,
        c: &'a str,
        scope: &'a str,
        key: &'a str,
        rev: u64,
    ) -> SyncFuture<'a, ()> {
        let (c, scope, key) = (c.to_string(), scope.to_string(), key.to_string());
        Box::pin(async move {
            self.app
                .write(move |tx| {
                    put(tx, &c, &key, rev);
                    tx.sync_upsert_for(&c, &scope, &key, rev).map(|_| ())
                })
                .await
        })
    }

    fn delete<'a>(
        &'a self,
        c: &'a str,
        scope: &'a str,
        key: &'a str,
        rev: u64,
    ) -> SyncFuture<'a, ()> {
        let (c, scope, key) = (c.to_string(), scope.to_string(), key.to_string());
        Box::pin(async move {
            self.app
                .write(move |tx| {
                    tx.execute(
                        "DELETE FROM items WHERE collection = ?1 AND id = ?2",
                        [&c, &key],
                    )?;
                    tx.sync_delete_for(&c, &scope, &key, rev).map(|_| ())
                })
                .await
        })
    }

    fn aborted_upsert<'a>(
        &'a self,
        c: &'a str,
        scope: &'a str,
        key: &'a str,
        rev: u64,
    ) -> SyncFuture<'a, ()> {
        let (c, scope, key) = (c.to_string(), scope.to_string(), key.to_string());
        Box::pin(async move {
            let failed = self
                .app
                .write(move |tx| {
                    put(tx, &c, &key, rev);
                    tx.sync_upsert_for(&c, &scope, &key, rev)?;
                    Err::<(), _>(Error::internal("simulated crash before commit", "none"))
                })
                .await;
            assert!(failed.is_err());
            Ok(())
        })
    }

    fn prune_tombstones<'a>(&'a self, c: &'a str) -> SyncFuture<'a, ()> {
        let c = c.to_string();
        Box::pin(async move {
            super::retention::prune_tombstones(&self.log, &c, u64::MAX / 2).map(|_| ())
        })
    }
}

#[tokio::test]
async fn the_sqlite_change_log_conforms_to_the_port() {
    assert_conforms(&fixture()).await;
}

mod gaps;
mod pure;
mod store;
