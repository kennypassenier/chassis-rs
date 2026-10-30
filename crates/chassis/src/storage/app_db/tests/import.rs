//! Tests of the one-time import hook: commit, rollback, retry and races.

use super::*;

fn import_spec(
    rows: u64,
    report_expected: u64,
    fail_after: bool,
    files: Vec<PathBuf>,
) -> AppDbSpec {
    AppDbSpec {
        migrations: schema(),
        import: Some(Box::new(move |tx, _ctx| {
            for i in 0..rows {
                tx.execute("INSERT INTO settings VALUES (?1, 'v')", [format!("k{i}")])?;
            }
            if fail_after {
                return Err(Error::dependency(
                    "the old file was torn at row 3",
                    "restore it",
                ));
            }
            Ok(ImportReport {
                expected: report_expected,
                imported: rows,
                files,
                stores: Vec::new(),
            })
        })),
    }
}

#[test]
fn a_good_import_commits_with_its_marker_renames_the_files_and_never_runs_again() {
    let dir = tempfile::tempdir().unwrap();
    let old = dir.path().join("old.json");
    std::fs::write(&old, b"[1,2,3]").unwrap();
    let path = dir.path().join("a.db");
    let app = AppDb::open(&path, import_spec(3, 3, false, vec![old.clone()]), vec![]).unwrap();
    assert_eq!(app.import_state(), ImportState::Done);
    assert_eq!(count(&app, "settings"), 3);
    assert!(!old.exists() && dir.path().join("old.json.migrated").exists());
    drop(app);
    // A second start with a hook that would double the rows: the marker holds.
    std::fs::write(&old, b"[1,2,3]").unwrap();
    let app = AppDb::open(&path, import_spec(3, 3, false, vec![old.clone()]), vec![]).unwrap();
    assert_eq!(
        count(&app, "settings"),
        3,
        "idempotent: the hook did not run"
    );
    assert!(old.exists(), "and renamed nothing");
}

#[test]
fn a_failed_import_rolls_back_whole_keeps_the_old_files_raises_a_problem_and_retries() {
    let dir = tempfile::tempdir().unwrap();
    let old = dir.path().join("old.json");
    std::fs::write(&old, b"[1,2,3]").unwrap();
    let path = dir.path().join("a.db");
    let app = AppDb::open(&path, import_spec(3, 3, true, vec![old.clone()]), vec![]).unwrap();
    assert!(
        matches!(app.import_state(), ImportState::Failed { .. }),
        "{:?}",
        app.import_state()
    );
    assert_eq!(
        count(&app, "settings"),
        0,
        "three rows were written inside the transaction and none survived"
    );
    assert!(
        old.exists() && !dir.path().join("old.json.migrated").exists(),
        "the old files stay"
    );
    let problems = app.problems();
    assert_eq!(problems.len(), 1);
    assert!(
        problems[0].why.contains("keeps using its old files"),
        "{problems:?}"
    );
    assert!(problems[0].remedy.contains("next start"), "{problems:?}");
    assert!(
        meta_get_blocking(&app, "import_done").is_none(),
        "no marker"
    );
    drop(app);
    // The next start, with a hook that works, imports.
    let app = AppDb::open(&path, import_spec(3, 3, false, vec![old.clone()]), vec![]).unwrap();
    assert_eq!(app.import_state(), ImportState::Done);
    assert_eq!(count(&app, "settings"), 3);
    assert!(app.problems().is_empty());
}

#[test]
fn a_count_mismatch_rolls_the_import_back_too() {
    let dir = tempfile::tempdir().unwrap();
    let app = AppDb::open(
        &dir.path().join("a.db"),
        import_spec(3, 4, false, vec![]),
        vec![],
    )
    .unwrap();
    assert!(matches!(app.import_state(), ImportState::Failed { .. }));
    assert_eq!(count(&app, "settings"), 0);
    assert!(
        app.problems()[0]
            .why
            .contains("wrote 3 row(s) but the old files held 4"),
        "{:?}",
        app.problems()
    );
}

/// Two starts racing on one file import once: the marker is re-read
/// inside the write transaction.
#[test]
fn two_racing_starts_import_once() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.db");
    let handles: Vec<_> = (0..4)
        .map(|_| {
            let path = path.clone();
            std::thread::spawn(move || {
                AppDb::open(&path, import_spec(5, 5, false, vec![]), vec![]).unwrap()
            })
        })
        .collect();
    let apps: Vec<AppDb> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    assert_eq!(count(&apps[0], "settings"), 5, "5 rows, not 5 x 4");
}

fn meta_get_blocking(app: &AppDb, key: &str) -> Option<String> {
    app.read_blocking(|c| meta_get(c, key)).unwrap()
}

#[test]
fn a_handle_that_never_opened_says_so_instead_of_panicking() {
    let h = AppDb::unopened().unwrap();
    let err = h.read_blocking(|_| Ok(())).unwrap_err();
    assert!(err.message.contains("not open yet"), "{err}");
    assert!(h.kinds().is_empty());
}
