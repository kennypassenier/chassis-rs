//! The gaps Medicine Cabinet logged: the change log exists before the app's
//! migrations, `backfill` seeds it once, `on_open` runs after the open, and
//! `create_tables` serves an app's own unit tests.

use super::*;
use crate::storage::db::meta_get;

fn seq_of(app: &AppDb, coll: &str) -> Vec<(String, i64)> {
    app.read_blocking(|c| {
        let mut st =
            c.prepare("SELECT key, seq FROM chassis_sync WHERE collection = ?1 ORDER BY key")?;
        let rows = st
            .query_map([coll], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
    .unwrap()
}

fn seeding_migration() -> Migration {
    Migration::code(|tx| {
        tx.execute_batch(SCHEMA)?;
        tx.execute_batch(
            "INSERT INTO items VALUES ('dishes','a',1),('dishes','b',4),('dishes','c',2);",
        )?;
        let n = backfill(tx, "dishes", [("a", 1u64), ("b", 4), ("c", 2)])?;
        assert_eq!(n, 3);
        Ok(())
    })
}

#[test]
fn a_migration_can_seed_the_change_log_because_the_table_exists_before_it() {
    let dir = tempfile::tempdir().unwrap();
    let app = AppDb::open(
        &dir.path().join("a.db"),
        AppDbSpec::new(vec![seeding_migration()]),
        vec![],
    )
    .unwrap();
    assert_eq!(seq_of(&app, "dishes").len(), 3);
    // The in-memory open has the same order.
    let mem = AppDb::open_in_memory(AppDbSpec::new(vec![seeding_migration()]), vec![]).unwrap();
    assert_eq!(seq_of(&mem, "dishes").len(), 3);
}

#[test]
fn backfill_is_idempotent_and_never_overwrites_a_later_change() {
    let app = fixture().app;
    let rows = [("a", 1u64), ("b", 2)];
    let first = app
        .write_blocking(|tx| backfill(tx, "dishes", rows))
        .unwrap();
    assert_eq!(first, 2);
    let before = seq_of(&app, "dishes");
    // A later delete of `a` must survive a second backfill.
    app.write_blocking(|tx| tx.sync_delete("dishes", "a", 3).map(|_| ()))
        .unwrap();
    let again = app
        .write_blocking(|tx| backfill(tx, "dishes", rows))
        .unwrap();
    assert_eq!(again, 0, "nothing new to record");
    let after = seq_of(&app, "dishes");
    assert_eq!(after[1], before[1], "b untouched");
    let deleted: i64 = app
        .read_blocking(|c| {
            Ok(c.query_row(
                "SELECT deleted FROM chassis_sync WHERE collection='dishes' AND key='a'",
                [],
                |r| r.get(0),
            )?)
        })
        .unwrap();
    assert_eq!(deleted, 1, "the tombstone stays");
}

#[test]
fn backfill_for_records_under_the_login_scope() {
    let app = fixture().app;
    app.write_blocking(|tx| backfill_for(tx, "notes", "login-1", [("n1".to_string(), 1u64)]))
        .unwrap();
    let scope: String = app
        .read_blocking(|c| {
            Ok(
                c.query_row("SELECT scope FROM chassis_sync WHERE key='n1'", [], |r| {
                    r.get(0)
                })?,
            )
        })
        .unwrap();
    assert_eq!(scope, "login-1");
}

#[test]
fn on_open_runs_once_after_migrations_and_can_use_the_database() {
    let app = AppDb::open_in_memory(
        AppDbSpec::new(vec![Migration::sql(SCHEMA)]).on_open(|db| {
            db.write_blocking(|tx| {
                tx.execute("INSERT INTO items VALUES ('x','k',1)", [])?;
                tx.sync_upsert("x", "k", 1).map(|_| ())
            })
        }),
        vec![],
    )
    .unwrap();
    assert_eq!(seq_of(&app, "x").len(), 1);
    assert!(app.problems().is_empty());
}

#[test]
fn a_failing_on_open_hook_is_a_storage_problem_not_a_failed_open() {
    let app = AppDb::open_in_memory(
        AppDbSpec::new(vec![Migration::sql(SCHEMA)])
            .on_open(|_| Err(Error::dependency("warm-up failed", "retry later"))),
        vec![],
    )
    .unwrap();
    let problems = app.problems();
    assert_eq!(problems.len(), 1);
    assert!(problems[0].why.contains("warm-up failed"));
    assert!(app.db().is_ok(), "the database is open and usable");
}

#[test]
fn create_tables_lets_a_plain_connection_record_changes_and_is_idempotent() {
    let mut conn = Connection::open_in_memory().unwrap();
    create_tables(&conn).unwrap();
    create_tables(&conn).unwrap();
    let tx = conn.transaction().unwrap();
    assert_eq!(tx.sync_upsert("dishes", "a", 1).unwrap(), 1);
    tx.commit().unwrap();
    assert_eq!(meta_get(&conn, "sync.seq").unwrap().as_deref(), Some("1"));
}
