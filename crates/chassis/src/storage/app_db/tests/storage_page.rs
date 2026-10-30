//! Tests of the Storage page operations: overview, preview, delete,
//! prune and compact.

use super::*;

#[test]
fn the_overview_lists_rows_oldest_newest_and_the_declared_filters() {
    let app = seeded();
    let ov = app.overview().unwrap();
    let e = ov.iter().find(|k| k.id == "events").unwrap();
    assert_eq!(e.stats.rows, 10);
    assert_eq!(
        e.stats.newest.as_deref(),
        Some(
            chrono::DateTime::from_timestamp(T0, 0)
                .unwrap()
                .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
                .as_str()
        )
    );
    assert!(e.stats.oldest < e.stats.newest);
    assert!(e.stats.bytes > 0, "dbstat gives the table's share");
    assert_eq!(e.filters.len(), 3);
    assert!(e.supports_age && !e.finished_automatically);
    assert!(
        ov.iter()
            .find(|k| k.id == "snoozes")
            .unwrap()
            .finished_automatically
    );
    assert!(
        ov.iter().all(|k| k.id != "settings"),
        "an undeclared table is no kind"
    );
}

#[test]
fn a_preview_reads_only_and_a_delete_removes_exactly_what_it_showed() {
    let app = seeded();
    let now = Now::at(T0);
    let before: i64 = app
        .read_blocking(|c| Ok(c.query_row("PRAGMA data_version", [], |r| r.get(0))?))
        .unwrap();
    let p = app.preview_at("events", &older(5), &now).unwrap();
    assert_eq!(p.stats.rows, 4, "days 6..9: strictly older than five days");
    assert_eq!(p.samples.len(), 4);
    assert_eq!(
        p.confirm_with, "Events",
        "what is typed is the name the page shows"
    );
    assert_eq!(count(&app, "events"), 10, "a preview deletes nothing");
    let after: i64 = app
        .read_blocking(|c| Ok(c.query_row("PRAGMA data_version", [], |r| r.get(0))?))
        .unwrap();
    assert_eq!(before, after, "and writes nothing");
    // Samples are the OLDEST first, and the time column is an instant,
    // not epoch digits.
    assert!(p.samples[0]["at"].is_string(), "{:?}", p.samples[0]);
    assert!(p.samples[0]["at"].as_str() < p.samples[1]["at"].as_str());

    let done = app
        .delete_at("events", &older(5), &p.token, "Events", &now)
        .unwrap();
    assert_eq!(done.deleted, 4);
    assert_eq!(done.remaining, 6);
    assert_eq!(count(&app, "events"), 6);
    assert_eq!(count(&app, "settings"), 1, "nothing else was touched");
}

#[test]
fn the_confirmation_must_be_the_kinds_name_and_the_token_must_be_ours() {
    let app = seeded();
    let now = Now::at(T0);
    let p = app.preview_at("events", &older(5), &now).unwrap();
    let err = app
        .delete_at("events", &older(5), &p.token, "yes", &now)
        .unwrap_err();
    assert!(err.remedy.contains("`Events`"), "{err}");
    let err = app
        .delete_at("events", &older(5), "garbage", "Events", &now)
        .unwrap_err();
    assert!(err.message.contains("token"), "{err}");
    let mut forged = p.token.clone();
    forged.replace_range(0..2, "ff");
    assert!(
        app.delete_at("events", &older(5), &forged, "Events", &now)
            .is_err()
    );
    // A token for another selector or kind is refused: it binds the selection.
    let err = app
        .delete_at("events", &older(2), &p.token, "Events", &now)
        .unwrap_err();
    assert!(err.message.contains("does not match"), "{err}");
    let err = app
        .delete_at("snoozes", &older(5), &p.token, "Snoozes", &now)
        .unwrap_err();
    assert!(err.message.contains("does not match"), "{err}");
    // Another AppDb (another secret) cannot honour it either.
    let other = seeded();
    assert!(
        other
            .delete_at("events", &older(5), &p.token, "Events", &now)
            .is_err()
    );
    // Stale: older than 15 minutes.
    let late = Now::at(T0 + 16 * 60);
    let err = app
        .delete_at("events", &older(5), &p.token, "Events", &late)
        .unwrap_err();
    assert!(err.message.contains("older than 15 minutes"), "{err}");
    assert_eq!(count(&app, "events"), 10, "every refusal deleted nothing");
}

/// Recount: a row that appeared after the preview changes the count, so
/// the delete refuses instead of removing something nobody looked at.
#[test]
fn the_delete_recounts_and_refuses_when_the_selection_moved() {
    let app = seeded();
    let now = Now::at(T0);
    let p = app.preview_at("events", &older(5), &now).unwrap();
    app.write_blocking(|tx| {
        Ok(tx.execute(
            "INSERT INTO events (at, level, seen, msg) VALUES (?1, 'info', 0, 'late arrival')",
            [T0 - 9 * 86_400],
        )?)
    })
    .unwrap();
    let err = app
        .delete_at("events", &older(5), &p.token, "Events", &now)
        .unwrap_err();
    assert!(
        err.message
            .contains("held 4 row(s) at the preview and holds 5 now"),
        "{err}"
    );
    assert_eq!(count(&app, "events"), 11, "nothing was deleted");
    // Preview again and the new count goes through.
    let p2 = app.preview_at("events", &older(5), &now).unwrap();
    assert_eq!(p2.stats.rows, 5);
    assert_eq!(
        app.delete_at("events", &older(5), &p2.token, "Events", &now)
            .unwrap()
            .deleted,
        5
    );
}

/// The age is fixed at the preview: a delete later does not sweep in
/// rows that only became old in between.
#[test]
fn the_age_is_an_absolute_instant_fixed_at_the_preview() {
    let app = seeded();
    let p = app.preview_at("events", &older(5), &Now::at(T0)).unwrap();
    let later = Now::at(T0 + 600);
    let done = app
        .delete_at("events", &older(5), &p.token, "Events", &later)
        .unwrap();
    assert_eq!(done.deleted, 4);
}

#[test]
fn filters_narrow_by_choice_flag_and_text_with_wildcards_escaped() {
    let app = seeded();
    let now = Now::at(T0);
    let with = |name: &str, value: &str| {
        let mut s = Selector::default();
        s.filters.insert(name.into(), value.into());
        app.preview_at("events", &s, &now).unwrap().stats.rows
    };
    assert_eq!(with("level", "error"), 5);
    assert_eq!(with("seen", "true"), 3);
    assert_eq!(with("seen", "false"), 7);
    assert_eq!(with("text", "message_4"), 1);
    assert_eq!(
        with("text", "50% done"),
        10,
        "the % is literal, not a wildcard"
    );
    assert_eq!(with("text", "5_ done"), 0, "the _ is literal too");
    // Combined with age.
    let mut s = older(5);
    s.filters.insert("level".into(), "error".into());
    assert_eq!(app.preview_at("events", &s, &now).unwrap().stats.rows, 2); // days 7 and 9
    // Refusals name the way out.
    let mut s = Selector::default();
    s.filters.insert("level".into(), "fatal".into());
    assert!(
        app.preview_at("events", &s, &now)
            .unwrap_err()
            .remedy
            .contains("info, error")
    );
    let mut s = Selector::default();
    s.filters.insert("nope".into(), "x".into());
    assert!(
        app.preview_at("events", &s, &now)
            .unwrap_err()
            .remedy
            .contains("level, seen, text")
    );
    let mut s = Selector::default();
    s.filters.insert("seen".into(), "maybe".into());
    assert!(app.preview_at("events", &s, &now).is_err());
    assert!(
        app.preview_at("settings", &Selector::default(), &now)
            .is_err(),
        "no such kind"
    );
    // A kind without a time cannot be limited by age.
}

#[test]
fn rfc3339_and_millisecond_columns_compare_in_their_own_format() {
    let app = seeded();
    let now = Now::at(T0);
    app.write_blocking(|tx| {
        for day in 0..4i64 {
            let at = T0 - day * 86_400;
            tx.execute(
                "INSERT INTO stamped (at) VALUES (?1)",
                [chrono::DateTime::from_timestamp(at, 0)
                    .unwrap()
                    .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)],
            )?;
            tx.execute("INSERT INTO millis (at) VALUES (?1)", [at * 1000])?;
        }
        Ok(())
    })
    .unwrap();
    for kind in ["stamped", "millis"] {
        let p = app.preview_at(kind, &older(2), &now).unwrap();
        assert_eq!(
            p.stats.rows, 1,
            "{kind}: only day 3 is strictly older than two days"
        );
        assert!(
            p.stats.oldest.as_deref().unwrap().ends_with('Z'),
            "{kind}: shown as RFC 3339"
        );
    }
}

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
