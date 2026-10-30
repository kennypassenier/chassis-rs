//! Tests of the numbered migrations, the refusal of a newer database and
//! the read-only inspection.

use rusqlite::TransactionBehavior;

use super::*;
use crate::core::error::Kind;

#[test]
fn migrations_run_once_in_order_and_a_reopen_applies_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    let db = Db::open(&path, &two()[..1]).unwrap();
    assert_eq!(db.schema_version(), 1);
    drop(db);
    let db = Db::open(&path, &two()).unwrap();
    assert_eq!(db.schema_version(), 2);
    let n: i64 = db
        .read_blocking(|c| Ok(c.query_row("SELECT count(*) FROM u", [], |r| r.get(0))?))
        .unwrap();
    assert_eq!(n, 0);
}

/// A migration that fails halfway leaves the database exactly at the
/// previous version: its DDL is rolled back with the version bump.
#[test]
fn a_failed_migration_rolls_back_whole_and_keeps_the_old_version() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    let mut steps = two()[..1].to_vec();
    steps.push(Migration::code(|tx| {
        tx.execute_batch("CREATE TABLE half (id INTEGER); INSERT INTO t (v) VALUES ('seed');")?;
        Err(Error::internal("boom", "none"))
    }));
    let err = Db::open(&path, &steps).unwrap_err();
    assert!(err.message.contains("migration 2"), "{err}");
    assert!(err.message.contains("rolled back"), "{err}");
    let insp = Db::inspect(&path, 2).unwrap();
    assert_eq!(insp.schema, Some(1), "still at the previous version");
    let conn = Connection::open(&path).unwrap();
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='half'")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert!(tables.is_empty(), "the half-made table is gone: {tables:?}");
    let n: i64 = conn
        .query_row("SELECT count(*) FROM t", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 0, "the seed row went with it");
    drop(conn);
    // The next start, with a fixed step, migrates cleanly.
    let db = Db::open(&path, &two()).unwrap();
    assert_eq!(db.schema_version(), 2);
}

/// The process dying inside a migration transaction (no commit, no
/// rollback call): on reopen the database is at the old version.
#[test]
fn a_crash_inside_a_migration_transaction_leaves_the_old_version() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    drop(Db::open(&path, &two()[..1]).unwrap());
    {
        let mut conn = Connection::open(&path).unwrap();
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .unwrap();
        tx.execute_batch("CREATE TABLE u (id INTEGER PRIMARY KEY); PRAGMA user_version = 2;")
            .unwrap();
        std::mem::forget(tx); // no commit, no rollback: the "crash"
        // `conn` drops here, closing the file mid-transaction.
    }
    assert_eq!(Db::inspect(&path, 2).unwrap().schema, Some(1));
    assert_eq!(Db::open(&path, &two()).unwrap().schema_version(), 2);
}

#[test]
fn a_newer_database_is_refused_with_the_restore_remedy() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    drop(Db::open(&path, &two()).unwrap());
    let err = Db::open(&path, &two()[..1]).unwrap_err();
    assert!(err.message.contains("schema 2"), "{err}");
    assert!(err.remedy.contains("pre-update copy"), "{err}");
    assert!(Db::inspect(&path, 1).unwrap().is_newer());
}

#[test]
fn inspect_creates_and_migrates_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    let none = Db::inspect(&path, 2).unwrap();
    assert!(!none.exists);
    assert!(none.describe().contains("created at start"));
    assert!(!path.exists());
    drop(Db::open(&path, &two()[..1]).unwrap());
    let behind = Db::inspect(&path, 2).unwrap();
    assert!(behind.describe().contains("migration runs at start"));
    assert_eq!(
        Db::inspect(&path, 2).unwrap().schema,
        Some(1),
        "not migrated by looking"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_failed_write_commits_nothing() {
    let db = Db::open_in_memory(&two()).unwrap();
    let err = db
        .write(|tx| {
            tx.execute("INSERT INTO t (v) VALUES ('a')", [])?;
            Err::<(), _>(Error::invalid("no", "no"))
        })
        .await
        .unwrap_err();
    assert_eq!(err.kind, Kind::Invalid);
    let n: i64 = db
        .read(|c| Ok(c.query_row("SELECT count(*) FROM t", [], |r| r.get(0))?))
        .await
        .unwrap();
    assert_eq!(n, 0);
    assert!(
        db.recent_write_failure().is_none(),
        "a refusal is not a sick file"
    );
}

/// Eight tasks and a second handle on the same file write at once: the
/// single writer and the busy timeout serialise them, none fails.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn parallel_writers_all_land() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    let a = Db::open(&path, &two()).unwrap();
    let b = Db::open(&path, &two()).unwrap();
    let mut tasks = Vec::new();
    for i in 0..8 {
        let db = if i % 2 == 0 { a.clone() } else { b.clone() };
        tasks.push(tokio::spawn(async move {
            for j in 0..25 {
                db.write(move |tx| {
                    tx.execute("INSERT INTO t (v) VALUES (?1)", [format!("{i}-{j}")])?;
                    Ok(())
                })
                .await
                .unwrap();
            }
        }));
    }
    for t in tasks {
        t.await.unwrap();
    }
    let n: i64 = a
        .read(|c| Ok(c.query_row("SELECT count(*) FROM t", [], |r| r.get(0))?))
        .await
        .unwrap();
    assert_eq!(n, 200);
}
