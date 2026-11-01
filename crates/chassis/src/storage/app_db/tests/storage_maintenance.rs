//! Tests of the declaration check at start and of the maintenance
//! operations: prune and compact.

use super::*;

#[test]
fn a_wrong_declaration_is_a_start_error() {
    for (kind, needle) in [
        (
            DataKind::new("Bad-Id", "x").table("events"),
            "the id must be",
        ),
        (
            DataKind::new("ghost", "x").table("nothing"),
            "no table `nothing`",
        ),
        (
            DataKind::new("a", "x")
                .table("events")
                .time_column("when", TimeFormat::UnixSeconds),
            "no time column",
        ),
        (
            DataKind::new("a", "x")
                .table("events")
                .filter(Filter::flag("f", "F", "nope")),
            "no column `nope`",
        ),
        (DataKind::new("a", "x").table("chassis_meta"), "reserved"),
        (
            DataKind::new("a", "x").table("events; DROP TABLE events"),
            "not a table name",
        ),
    ] {
        let err = AppDb::open_in_memory(
            AppDbSpec {
                options: Default::default(),
                migrations: schema(),
                import: None,
            },
            vec![kind],
        )
        .unwrap_err();
        assert!(err.message.contains(needle), "{needle}: {err}");
    }
    let err = AppDb::open_in_memory(
        AppDbSpec {
            options: Default::default(),
            migrations: schema(),
            import: None,
        },
        vec![
            DataKind::new("a", "x")
                .table("events")
                .finished_by_definition("nonsense <<<"),
        ],
    )
    .unwrap_err();
    assert!(err.message.contains("finished_by_definition"), "{err}");
    let err = AppDb::open_in_memory(
        AppDbSpec {
            options: Default::default(),
            migrations: schema(),
            import: None,
        },
        vec![
            DataKind::new("a", "x").table("events"),
            DataKind::new("a", "y").table("snoozes"),
        ],
    )
    .unwrap_err();
    assert!(err.message.contains("twice"), "{err}");
}

/// Finished-by-definition pruning touches only what a kind declared:
/// not its other rows, not a kind without a rule, not an undeclared table.
#[test]
fn pruning_touches_only_declared_finished_rows() {
    let app = seeded();
    app.write_blocking(|tx| {
        tx.execute(
            "INSERT INTO snoozes (until) VALUES (?1), (?2), (?3)",
            [T0 - 10, T0 - 1, T0 + 100],
        )?;
        Ok(())
    })
    .unwrap();
    let removed = app.prune_finished_at(&Now::at(T0)).unwrap();
    assert_eq!(
        removed,
        vec![("snoozes".to_string(), 2)],
        "only the kind with a rule reports"
    );
    assert_eq!(count(&app, "snoozes"), 1, "the running snooze stays");
    assert_eq!(
        count(&app, "events"),
        10,
        "a kind without a rule is never auto-pruned, however old"
    );
    assert_eq!(
        count(&app, "settings"),
        1,
        "an undeclared table is never touched"
    );
    // Nothing left to remove the second time.
    assert_eq!(
        app.prune_finished_at(&Now::at(T0)).unwrap(),
        vec![("snoozes".to_string(), 0)]
    );
}

#[test]
fn compact_reclaims_the_pages_a_delete_freed_and_is_refused_while_paused() {
    let dir = tempfile::tempdir().unwrap();
    let app = AppDb::open(
        &dir.path().join("a.db"),
        AppDbSpec {
            options: Default::default(),
            migrations: schema(),
            import: None,
        },
        kinds(),
    )
    .unwrap();
    app.write_blocking(|tx| {
        for i in 0..400i64 {
            tx.execute(
                "INSERT INTO events (at, level, msg) VALUES (?1, 'info', ?2)",
                rusqlite::params![i, "x".repeat(500)],
            )?;
        }
        Ok(())
    })
    .unwrap();
    let sel = Selector::default();
    let p = app.preview("events", &sel).unwrap();
    let del = app.delete("events", &sel, &p.token, "Events").unwrap();
    assert_eq!(del.deleted, 400);
    assert!(del.reclaimable_bytes > 100_000, "{del:?}");
    let before = app.compact_preview().unwrap();
    assert_eq!(before.reclaimable_bytes, del.reclaimable_bytes);
    let after = app.compact().unwrap();
    assert_eq!(after.reclaimable_bytes, 0);
    assert!(after.file_bytes < before.file_bytes);
}
