//! Tests of what kyu asked the kit for (2026-11-01): the copy before a
//! migration and its pruning, the write probe, writes with the project's
//! own error type, and the pool's size and kind.

use super::*;
use crate::core::error::Kind;

fn steps(n: usize) -> Vec<Migration> {
    (0..n)
        .map(|i| {
            Migration::code(move |tx| {
                Ok(tx.execute_batch(&format!("CREATE TABLE t{i} (v INTEGER) STRICT;"))?)
            })
        })
        .collect()
}

#[test]
fn an_existing_file_is_copied_before_it_migrates_and_old_copies_are_pruned() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("kyu.db");
    let opts = DbOptions::new().pre_migration_snapshots(2);
    drop(Db::open_with(&path, &steps(1), &opts).unwrap());
    assert!(
        !dir.path().join("kyu.pre-v0.db").exists(),
        "a fresh file has nothing to keep"
    );
    for n in 2..=11 {
        drop(Db::open_with(&path, &steps(n), &opts).unwrap());
    }
    let mut left: Vec<String> = std::fs::read_dir(dir.path())
        .unwrap()
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .filter(|n| n.contains(".pre-v"))
        .collect();
    left.sort();
    // Versions 9 and 10, by number: as text "pre-v10" sorts before "pre-v9".
    assert_eq!(left, ["kyu.pre-v10.db", "kyu.pre-v9.db"]);
    let copy = rusqlite::Connection::open(dir.path().join("kyu.pre-v10.db")).unwrap();
    let v: i64 = copy
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap();
    assert_eq!(v, 10, "the copy holds the schema before the step");
}

#[test]
fn without_the_option_no_copy_is_taken() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    drop(Db::open(&path, &steps(1)).unwrap());
    drop(Db::open(&path, &steps(2)).unwrap());
    assert!(!dir.path().join("a.pre-v1.db").exists());
}

/// A store that cannot take the write lock (here: another connection holds
/// it past the busy timeout, as a stuck or read-only file would) fails the
/// probe with a sentence, and the failure shows on the status page.
#[test]
fn the_probe_passes_on_a_writable_file_and_fails_when_writes_are_refused() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    let db = Db::open(&path, &steps(1)).unwrap();
    db.probe_writable().unwrap();
    assert!(db.recent_write_failure().is_none());
    let held = rusqlite::Connection::open(&path).unwrap();
    held.execute_batch("BEGIN IMMEDIATE").unwrap();
    db.set_busy_timeout(std::time::Duration::from_millis(50))
        .unwrap();
    let e = db.probe_writable().unwrap_err();
    assert!(e.message.contains("does not take writes"), "{e:?}");
    assert!(
        db.recent_write_failure().is_some(),
        "a failed probe makes the store look sick"
    );
}

#[derive(Debug, PartialEq)]
enum AppError {
    UnknownTopic,
    Store(Kind),
}

impl From<Error> for AppError {
    fn from(e: Error) -> Self {
        AppError::Store(e.kind)
    }
}

#[test]
fn a_write_can_answer_with_the_projects_own_error_and_a_refusal_is_not_a_sick_store() {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(&dir.path().join("a.db"), &steps(1)).unwrap();
    let refused: Result<(), AppError> = db.write_blocking_as(|_| Err(AppError::UnknownTopic));
    assert_eq!(refused, Err(AppError::UnknownTopic));
    assert!(db.recent_write_failure().is_none());
    let n = db
        .write_blocking_as::<_, AppError>(|tx| {
            tx.execute("INSERT INTO t0 VALUES (7)", [])
                .map_err(|e| AppError::from(Error::from(e)))
        })
        .unwrap();
    assert_eq!(n, 1);
    db.note_failure(&Error::dependency("disk full", "free space"));
    assert_eq!(db.recent_write_failure().as_deref(), Some("disk full"));
}

#[test]
fn the_pool_size_and_kind_follow_the_options_and_a_huge_pool_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    let db = Db::open_with(
        &path,
        &steps(1),
        &DbOptions::new().readers(4).writable_readers(),
    )
    .unwrap();
    assert_eq!(db.inner.readers.len(), 4);
    db.read_blocking(|c| Ok(c.execute_batch("CREATE TEMP TABLE scratch (v INTEGER)")?))
        .unwrap();
    let e =
        Db::open_with(&path, &steps(1), &DbOptions::new().readers(MAX_READERS + 1)).unwrap_err();
    assert!(e.message.contains("readers"), "{e:?}");
}

/// kyu, 2026-11-01: a passing probe proves only the lock, so a failure a
/// real write recorded stays visible, with its age.
#[test]
fn a_passing_probe_keeps_a_real_write_failure_and_its_age() {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(&dir.path().join("a.db"), &steps(1)).unwrap();
    db.note_failure(&Error::dependency("disk full", "free space"));
    db.probe_writable().unwrap();
    let (why, age) = db.recent_write_failure_age().expect("still recorded");
    assert_eq!(why, "disk full");
    assert!(age < std::time::Duration::from_secs(5), "{age:?}");
}

/// A bare file name has the empty path as its parent; pruning must read that
/// as the current directory and not fail the start. (Reading the directory
/// is the point, so the test runs the prune itself and changes no global
/// state: nothing named `bare.pre-v*` lives in the crate folder.)
#[test]
fn a_bare_file_name_has_a_folder_to_prune_in() {
    super::super::snapshot::prune(std::path::Path::new("bare.db"), 1, 2)
        .expect("a bare file name means the current directory");
}

/// After a restore of an older backup the copy just taken has a LOWER
/// version than leftovers from the newer line; pruning by version alone
/// would delete the one copy this migration's way back depends on.
#[test]
fn the_copy_just_taken_is_never_the_one_pruned() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    let opts = DbOptions::new().pre_migration_snapshots(1);
    std::fs::write(dir.path().join("a.pre-v7.db"), b"older line").unwrap();
    drop(Db::open_with(&path, &steps(2), &opts).unwrap());
    drop(Db::open_with(&path, &steps(3), &opts).unwrap());
    assert!(
        dir.path().join("a.pre-v2.db").exists(),
        "the fresh copy must survive"
    );
}
