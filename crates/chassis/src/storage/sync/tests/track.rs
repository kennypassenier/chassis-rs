//! Table-backed collections: triggers mark, `AppDb::write` flushes, cascades
//! are captured, existing rows are seeded once, and the table-diff helper
//! finds a write path the declaration does not cover.

use super::*;
use crate::storage::sync::table_diff::{assert_write_recorded, compare_write};

const TABLES: &str = "
CREATE TABLE projects (id TEXT PRIMARY KEY) STRICT;
CREATE TABLE tasks (
    id TEXT PRIMARY KEY, rev INTEGER NOT NULL DEFAULT 1, done_at INTEGER,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
) STRICT;
CREATE TABLE task_tags (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, tag TEXT NOT NULL
) STRICT;
CREATE TABLE task_links (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, url TEXT NOT NULL
) STRICT;
INSERT INTO projects VALUES ('p1');
INSERT INTO tasks (id, rev, project_id) VALUES ('old', 3, 'p1');
";

fn tasks() -> SyncCollection {
    SyncCollection::table("tasks", "id")
        .shared()
        .live_when("done_at IS NULL")
        .also("task_tags", "task_id")
}

fn tracked_app() -> AppDb {
    let app = AppDb::open_in_memory(AppDbSpec::new(vec![Migration::sql(TABLES)]), vec![]).unwrap();
    app.track_sync_tables(&[tasks()]).unwrap();
    app
}

/// `(key, rev, deleted)` of the change log, in key order.
fn log(app: &AppDb) -> Vec<(String, i64, bool)> {
    app.read_blocking(|c| {
        let mut st = c.prepare(
            "SELECT key, rev, deleted FROM chassis_sync WHERE collection = 'tasks' ORDER BY key",
        )?;
        let rows = st
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? != 0)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
    .unwrap()
}

fn run(app: &AppDb, sql: &'static str) {
    app.write_blocking(|tx| Ok(tx.execute_batch(sql)?)).unwrap();
}

#[test]
fn rows_that_exist_before_the_triggers_are_seeded_once() {
    let app = tracked_app();
    assert_eq!(log(&app), [("old".to_string(), 3, false)]);
    let again = app.read_blocking(|c| {
        Ok(c.query_row("SELECT MAX(seq) FROM chassis_sync", [], |r| {
            r.get::<_, i64>(0)
        })?)
    });
    assert_eq!(again.unwrap(), 1, "one record, one counter step");
}

#[test]
fn insert_update_and_delete_are_recorded_in_the_same_transaction() {
    let app = tracked_app();
    run(&app, "INSERT INTO tasks (id, rev) VALUES ('a', 1)");
    run(&app, "UPDATE tasks SET rev = 2 WHERE id = 'a'");
    assert!(log(&app).contains(&("a".to_string(), 2, false)));
    run(&app, "UPDATE tasks SET done_at = 5, rev = 3 WHERE id = 'a'");
    assert!(
        log(&app).contains(&("a".to_string(), 3, true)),
        "a row that is no longer live is a tombstone at its revision"
    );
    run(&app, "DELETE FROM tasks WHERE id = 'a'");
    assert!(
        log(&app).contains(&("a".to_string(), 4, true)),
        "a purged row: next revision"
    );
}

#[test]
fn a_write_that_fails_leaves_neither_marks_nor_changes() {
    let app = tracked_app();
    let failed = app.write_blocking(|tx| {
        tx.execute("INSERT INTO tasks (id) VALUES ('ghost')", [])?;
        Err::<(), _>(Error::internal("boom", "none"))
    });
    assert!(failed.is_err());
    assert!(log(&app).iter().all(|(k, ..)| k != "ghost"));
    let marks: i64 = app
        .read_blocking(|c| {
            Ok(c.query_row("SELECT COUNT(*) FROM chassis_sync_dirty", [], |r| r.get(0))?)
        })
        .unwrap();
    assert_eq!(marks, 0);
}

#[test]
fn sql_cascades_are_captured_without_a_call_per_write_path() {
    let app = tracked_app();
    run(
        &app,
        "INSERT INTO tasks (id, rev, project_id) VALUES ('t', 1, 'p1')",
    );
    run(&app, "INSERT INTO task_tags VALUES ('t', 'x'), ('t', 'y')");
    let before = log(&app);
    // SET NULL on the task, no write of the task by the app.
    run(&app, "DELETE FROM projects WHERE id = 'p1'");
    let after = log(&app);
    assert_ne!(before, after, "the task changed by cascade: {after:?}");
    // CASCADE on the child rows: the record they belong to changed.
    let seq = |a: &AppDb| {
        a.read_blocking(|c| {
            Ok(
                c.query_row("SELECT seq FROM chassis_sync WHERE key='t'", [], |r| {
                    r.get::<_, i64>(0)
                })?,
            )
        })
        .unwrap()
    };
    let s0 = seq(&app);
    run(&app, "DELETE FROM tasks WHERE id = 't'");
    assert!(seq(&app) > s0);
}

#[test]
fn two_marks_of_one_key_under_a_cascading_delete_do_not_fail() {
    // The trap of INSERT OR IGNORE in a trigger: the outer DELETE's conflict
    // rule wins and the second mark of 't' (task, then its tags) would fail.
    let app = tracked_app();
    run(&app, "INSERT INTO tasks (id) VALUES ('t')");
    run(
        &app,
        "INSERT INTO task_tags VALUES ('t', 'x'), ('t', 'y'), ('t', 'z')",
    );
    run(&app, "DELETE FROM tasks WHERE id = 't'");
    run(&app, "REPLACE INTO tasks (id) VALUES ('r')");
    assert!(log(&app).iter().any(|(k, ..)| k == "r"));
}

#[test]
fn the_declaration_is_validated_at_start() {
    let c = |c: SyncCollection| c.validate();
    assert!(
        c(SyncCollection::table("tasks", "id")).is_err(),
        "not shared"
    );
    assert!(
        c(SyncCollection::new("tasks").shared().also("a", "b")).is_err(),
        "also without table"
    );
    assert!(
        c(SyncCollection::table("tasks", "id")
            .shared()
            .rev_column("x; DROP"))
        .is_err()
    );
    assert!(
        c(SyncCollection::table("tasks", "id")
            .shared()
            .live_when("1; DELETE FROM t"))
        .is_err()
    );
    assert!(c(SyncCollection::table("tasks", "id").shared()).is_ok());
    let app = AppDb::open_in_memory(AppDbSpec::new(vec![Migration::sql(TABLES)]), vec![]).unwrap();
    let missing = SyncCollection::table("tasks", "id")
        .shared()
        .also("no_such", "task_id");
    assert!(
        app.track_sync_tables(&[missing]).is_err(),
        "a missing table is a start error"
    );
}

#[test]
fn the_table_diff_agrees_with_the_change_log_and_finds_an_undeclared_table() {
    let app = tracked_app();
    let collections = [tasks()];
    assert_write_recorded(&app, &collections, |tx| {
        tx.execute("INSERT INTO task_tags VALUES ('old', 'urgent')", [])?;
        Ok(())
    });
    assert_write_recorded(&app, &collections, |tx| {
        tx.execute("DELETE FROM projects WHERE id = 'p1'", [])?;
        Ok(())
    });
    // task_links is a part of the record the declaration does not name.
    let report = compare_write(&app, &collections, |tx| {
        tx.execute("INSERT INTO task_links VALUES ('old', 'https://x')", [])?;
        Ok(())
    })
    .unwrap();
    assert!(
        report.is_clean(),
        "an undeclared table is not part of the diff either"
    );
    let report = compare_write(
        &app,
        &[SyncCollection::table("tasks", "id")
            .shared()
            .also("task_links", "task_id")],
        |tx| {
            tx.execute("INSERT INTO task_links VALUES ('old', 'https://y')", [])?;
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(
        report.missed,
        ["tasks/old"],
        "declared in the diff, absent from the triggers"
    );
}
