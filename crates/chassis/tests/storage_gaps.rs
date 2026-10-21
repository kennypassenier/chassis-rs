//! Three gaps the homelab found adopting 3.11.0 (3.12.0): a report a test can
//! build and a prune at a chosen instant (139), an import reported per store
//! with renames only for stores that moved (140), a kind over a
//! `WITHOUT ROWID` table (141).
#![cfg(feature = "storage")]

use chassis::storage::{
    AppDb, AppDbSpec, DataKind, FileReport, FileSizes, ImportReport, ImportState, ImportStore,
    Level, Migration, Now, Selector, StorageReport, TimeFormat, mark_migrated,
};

// ---- 139 -------------------------------------------------------------------

#[test]
fn a_storage_report_can_be_built_by_hand() {
    let sizes = FileSizes::new(900, 100, 50);
    let r = StorageReport::new(
        vec![FileReport::new("app", "svc.db", sizes, true)],
        1000,
        2000,
        1500,
        Level::Warn,
        42,
    );
    assert_eq!(r.level, Level::Warn);
    assert_eq!(r.files[0].total_bytes, 1000);
    assert_eq!(r.files[0].file, "svc.db");
    let j = serde_json::to_value(&r).unwrap();
    assert_eq!(j["files"][0]["reclaimable_bytes"], 50);
    assert_eq!(j["budget_bytes"], 2000);
}

#[test]
fn finished_rows_are_pruned_at_a_chosen_instant() {
    let db = AppDb::open_in_memory(
        AppDbSpec::new(vec![Migration::sql(
            "CREATE TABLE snoozes (id INTEGER PRIMARY KEY, until INTEGER NOT NULL) STRICT;",
        )]),
        vec![
            DataKind::new("snoozes", "Snoozes")
                .table("snoozes")
                .time_column("until", TimeFormat::UnixSeconds)
                .finished_by_definition("until < :now"),
        ],
    )
    .unwrap();
    db.write_blocking(|tx| {
        for t in [100, 200, 300] {
            tx.execute("INSERT INTO snoozes (until) VALUES (?1)", [t])?;
        }
        Ok(())
    })
    .unwrap();
    assert_eq!(
        db.prune_finished_at(&Now::at(250)).unwrap(),
        vec![("snoozes".to_string(), 2)]
    );
    assert_eq!(
        db.prune_finished_at(&Now::at(250)).unwrap(),
        vec![("snoozes".to_string(), 0)]
    );
}

// ---- 140 -------------------------------------------------------------------

fn spec_with(hook: impl FnOnce() -> ImportReport + Send + 'static) -> AppDbSpec {
    AppDbSpec::new(vec![Migration::sql(
        "CREATE TABLE a (v TEXT) STRICT; CREATE TABLE b (v TEXT) STRICT;",
    )])
    .with_import(move |tx, _| {
        tx.execute("INSERT INTO a VALUES ('x')", [])?;
        Ok(hook())
    })
}

#[test]
fn an_import_reports_per_store_and_renames_only_moved_stores() {
    let dir = tempfile::tempdir().unwrap();
    let moved = dir.path().join("moved.json");
    let copied = dir.path().join("copied.json");
    std::fs::write(&moved, "{}").unwrap();
    std::fs::write(&copied, "{}").unwrap();
    let (m, c) = (moved.clone(), copied.clone());
    let db = AppDb::open(
        &dir.path().join("svc.db"),
        spec_with(move || {
            ImportReport::from_stores(vec![
                ImportStore::new("moved", 2, 2).moved(vec![m]),
                ImportStore::new("copied", 3, 3),
            ])
        }),
        vec![],
    )
    .unwrap();
    assert_eq!(db.import_state(), ImportState::Done);
    assert!(!moved.exists() && dir.path().join("moved.json.migrated").exists());
    assert!(
        copied.exists(),
        "a store copied but still on its file stays put"
    );
    let _ = c;
    // The project moves the second store later, in a step of its own.
    mark_migrated(std::slice::from_ref(&copied));
    assert!(!copied.exists() && dir.path().join("copied.json.migrated").exists());
}

#[test]
fn a_store_that_does_not_match_rolls_the_import_back_and_is_named() {
    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("old.json");
    std::fs::write(&f, "{}").unwrap();
    let f2 = f.clone();
    let db = AppDb::open(
        &dir.path().join("svc.db"),
        spec_with(move || {
            ImportReport::from_stores(vec![
                ImportStore::new("good", 1, 1).moved(vec![f2]),
                ImportStore::new("uptime", 5, 4),
            ])
        }),
        vec![],
    )
    .unwrap();
    match db.import_state() {
        ImportState::Failed { why } => assert!(why.contains("`uptime`"), "{why}"),
        other => panic!("{other:?}"),
    }
    assert!(f.exists(), "nothing was renamed");
    let rows: i64 = db
        .read_blocking(|c| Ok(c.query_row("SELECT count(*) FROM a", [], |r| r.get(0))?))
        .unwrap();
    assert_eq!(rows, 0, "rolled back");
}

// ---- 141 -------------------------------------------------------------------

#[test]
fn a_kind_over_a_without_rowid_table_previews_by_primary_key() {
    let db = AppDb::open_in_memory(
        AppDbSpec::new(vec![Migration::sql(
            "CREATE TABLE cells (host TEXT NOT NULL, slot INTEGER NOT NULL, at INTEGER NOT NULL, up INTEGER NOT NULL, PRIMARY KEY (host, slot)) STRICT, WITHOUT ROWID;",
        )]),
        vec![
            DataKind::new("cells", "Cells")
                .table("cells")
                .time_column("at", TimeFormat::UnixSeconds),
        ],
    )
    .expect("accepted at registration");
    db.write_blocking(|tx| {
        // Same time everywhere: only the primary key can order them.
        for (h, s) in [("b", 1), ("a", 2), ("a", 1)] {
            tx.execute(
                "INSERT INTO cells VALUES (?1, ?2, 5, 1)",
                chassis::storage::rusqlite::params![h, s],
            )?;
        }
        Ok(())
    })
    .unwrap();
    let p = db.preview("cells", &Selector::all()).unwrap();
    let order: Vec<(String, i64)> = p
        .samples
        .iter()
        .map(|r| {
            (
                r["host"].as_str().unwrap().to_string(),
                r["slot"].as_i64().unwrap(),
            )
        })
        .collect();
    assert_eq!(order, [("a".into(), 1), ("a".into(), 2), ("b".into(), 1)]);
    assert_eq!(p.stats.rows, 3);
}
