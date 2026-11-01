//! Tests of the app database: the Storage page operations and the
//! one-time import, over a seeded in-memory file. The fixtures live here;
//! the cases are split by what they exercise.

use std::path::PathBuf;

use super::*;
use crate::core::error::Error;
use crate::storage::db::meta_get;
use crate::storage::kinds::{DataKind, Now, Selector};
use crate::storage::kinds::{Filter, TimeFormat};

mod import;
mod storage_maintenance;
mod storage_page;

pub(super) const T0: i64 = 1_800_000_000;

pub(super) fn schema() -> Vec<Migration> {
    vec![Migration::sql(
            "CREATE TABLE events (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, level TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0, msg TEXT NOT NULL) STRICT;
             CREATE TABLE snoozes (id INTEGER PRIMARY KEY, until INTEGER NOT NULL) STRICT;
             CREATE TABLE stamped (id INTEGER PRIMARY KEY, at TEXT NOT NULL) STRICT;
             CREATE TABLE millis (id INTEGER PRIMARY KEY, at INTEGER NOT NULL) STRICT;
             CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT NOT NULL) STRICT;",
        )]
}

pub(super) fn kinds() -> Vec<DataKind> {
    vec![
        DataKind::new("events", "Events")
            .description("what happened")
            .table("events")
            .time_column("at", TimeFormat::UnixSeconds)
            .filter(Filter::choice("level", "Level", "level", ["info", "error"]))
            .filter(Filter::flag("seen", "Seen", "seen"))
            .filter(Filter::text("text", "Message contains", "msg")),
        DataKind::new("snoozes", "Snoozes")
            .table("snoozes")
            .time_column("until", TimeFormat::UnixSeconds)
            .finished_by_definition("until < :now"),
        DataKind::new("stamped", "Stamped")
            .table("stamped")
            .time_column("at", TimeFormat::Rfc3339),
        DataKind::new("millis", "Millis")
            .table("millis")
            .time_column("at", TimeFormat::UnixMillis),
    ]
}

pub(super) fn seeded() -> AppDb {
    let app = AppDb::open_in_memory(
        AppDbSpec {
            options: Default::default(),
            migrations: schema(),
            import: None,
        },
        kinds(),
    )
    .unwrap();
    app.write_blocking(|tx| {
        // 10 events, one per day back from T0; day 0 is the newest.
        for day in 0..10i64 {
            tx.execute(
                "INSERT INTO events (at, level, seen, msg) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![
                    T0 - day * 86_400,
                    if day % 2 == 0 { "info" } else { "error" },
                    i64::from(day < 3),
                    format!("message_{day} 50% done")
                ],
            )?;
        }
        tx.execute("INSERT INTO settings VALUES ('theme', 'dark')", [])?;
        Ok(())
    })
    .unwrap();
    app
}

pub(super) fn count(app: &AppDb, table: &str) -> i64 {
    app.read_blocking(|c| {
        Ok(c.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))?)
    })
    .unwrap()
}

pub(super) fn older(days: u64) -> Selector {
    Selector {
        older_than_secs: Some(days * 86_400),
        ..Default::default()
    }
}
