//! Conformance helper for apps with table-backed collections
//! ([`SyncCollection::table`]): run one write path, then compare a diff of the
//! tables with what `chassis_sync` recorded. A write path that changes a
//! record without the change log hearing of it fails the test.
//!
//! ```text
//! let report = compare_write(&app, &collections, |tx| {
//!     tx.execute("DELETE FROM projects WHERE id = 7", [])?;   // cascades
//!     Ok(())
//! })?;
//! assert!(report.is_clean(), "{report:?}");
//! // or, panicking with the report:
//! assert_write_recorded(&app, &collections, |tx| { /* ... */ Ok(()) });
//! ```
//!
//! The diff compares whole rows of the record's table and of its `also`
//! tables, per record. Needs [`AppDb::track_sync_tables`] to have run (the
//! app does it at start). A write that only rewrites a row to the same
//! values fires the trigger but changes no row: it is reported under `extra`,
//! which does not fail [`assert_write_recorded`].

use std::collections::{BTreeMap, BTreeSet};

use rusqlite::{Connection, Transaction};

use super::SyncCollection;
use crate::core::error::Error;
use crate::storage::AppDb;

/// What one write did to the tables, and what the change log heard of it.
/// Entries read `<collection>/<key>`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
#[non_exhaustive]
pub struct WriteReport {
    /// Records whose rows (or membership) differ before and after.
    pub changed: BTreeSet<String>,
    /// Records the change log recorded during the write.
    pub recorded: BTreeSet<String>,
    /// Changed but not recorded: the bug this helper exists to find.
    pub missed: Vec<String>,
    /// Recorded but no row differs (a rewrite to the same values).
    pub extra: Vec<String>,
    /// Recorded as a delete while the record is live, or the reverse.
    pub wrong_kind: Vec<String>,
}

impl WriteReport {
    /// Nothing missed and no record recorded as the wrong kind of change.
    pub fn is_clean(&self) -> bool {
        self.missed.is_empty() && self.wrong_kind.is_empty()
    }
}

/// One record as the tables hold it: its rows (rendered) and whether it is
/// in the collection.
#[derive(PartialEq, Eq)]
struct Look {
    rows: Vec<String>,
    live: bool,
}

type Snapshot = BTreeMap<String, Look>;

/// Run `write` through [`AppDb::write_blocking`] and compare the table diff
/// with the change log.
pub fn compare_write(
    app: &AppDb,
    collections: &[SyncCollection],
    write: impl FnOnce(&Transaction) -> Result<(), Error>,
) -> Result<WriteReport, Error> {
    let tracked: Vec<&SyncCollection> = collections.iter().filter(|c| c.is_tracked()).collect();
    let (before, seq) = app.read_blocking(|c| Ok((snapshot(c, &tracked)?, max_seq(c)?)))?;
    app.write_blocking(write)?;
    let (after, recorded) =
        app.read_blocking(|c| Ok((snapshot(c, &tracked)?, recorded_since(c, seq, &tracked)?)))?;
    Ok(report(&before, &after, &recorded))
}

/// [`compare_write`] that panics with the report when a change was missed.
pub fn assert_write_recorded(
    app: &AppDb,
    collections: &[SyncCollection],
    write: impl FnOnce(&Transaction) -> Result<(), Error>,
) {
    let r = compare_write(app, collections, write).expect("the write and its comparison run");
    assert!(
        r.is_clean(),
        "the change log missed or mis-recorded a change of this write: {r:#?}"
    );
}

fn report(before: &Snapshot, after: &Snapshot, recorded: &BTreeMap<String, bool>) -> WriteReport {
    let mut r = WriteReport::default();
    let keys: BTreeSet<&String> = before.keys().chain(after.keys()).collect();
    for key in keys {
        if before.get(key) != after.get(key) {
            r.changed.insert(key.clone());
        }
    }
    r.recorded = recorded.keys().cloned().collect();
    r.missed = r.changed.difference(&r.recorded).cloned().collect();
    r.extra = r.recorded.difference(&r.changed).cloned().collect();
    for (key, deleted) in recorded {
        let live = after.get(key).is_some_and(|l| l.live);
        if *deleted == live {
            r.wrong_kind.push(key.clone());
        }
    }
    r
}

fn max_seq(c: &Connection) -> Result<i64, Error> {
    Ok(
        c.query_row("SELECT COALESCE(MAX(seq), 0) FROM chassis_sync", [], |r| {
            r.get(0)
        })?,
    )
}

/// `<collection>/<key>` -> deleted, for the changes after `seq`.
fn recorded_since(
    c: &Connection,
    seq: i64,
    tracked: &[&SyncCollection],
) -> Result<BTreeMap<String, bool>, Error> {
    let mut stmt = c.prepare("SELECT collection, key, deleted FROM chassis_sync WHERE seq > ?1")?;
    let rows = stmt.query_map([seq], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, i64>(2)? != 0,
        ))
    })?;
    let mut out = BTreeMap::new();
    for row in rows {
        let (collection, key, deleted) = row?;
        if tracked.iter().any(|t| t.name() == collection) {
            out.insert(format!("{collection}/{key}"), deleted);
        }
    }
    Ok(out)
}

fn snapshot(c: &Connection, tracked: &[&SyncCollection]) -> Result<Snapshot, Error> {
    let mut out = Snapshot::new();
    for coll in tracked {
        let Some(t) = coll.tracking() else { continue };
        let live = t.live.as_deref().unwrap_or("1");
        let sql = format!(
            "SELECT CAST(\"{}\" AS TEXT), ({live}) FROM \"{}\"",
            t.key_column, t.table
        );
        let mut stmt = c.prepare(&sql)?;
        let flags = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?)))?;
        for f in flags {
            let (key, live) = f?;
            out.insert(
                format!("{}/{key}", coll.name()),
                Look {
                    rows: Vec::new(),
                    live,
                },
            );
        }
        let own = std::iter::once((t.table.as_str(), t.key_column.as_str()));
        let kids = t.children.iter().map(|(a, b)| (a.as_str(), b.as_str()));
        for (table, column) in own.chain(kids) {
            add_rows(c, coll.name(), table, column, &mut out)?;
        }
        for look in out.values_mut() {
            look.rows.sort();
        }
    }
    Ok(out)
}

/// Every row of `table`, rendered, under the record its `column` names.
fn add_rows(
    c: &Connection,
    collection: &str,
    table: &str,
    column: &str,
    out: &mut Snapshot,
) -> Result<(), Error> {
    let mut stmt = c.prepare(&format!("SELECT * FROM \"{table}\""))?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let at = names.iter().position(|n| n == column).ok_or_else(|| {
        Error::config(
            format!("table `{table}` has no column `{column}`"),
            "fix the declaration",
        )
    })?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let key = match row.get_ref(at)? {
            rusqlite::types::ValueRef::Null => continue,
            rusqlite::types::ValueRef::Integer(i) => i.to_string(),
            rusqlite::types::ValueRef::Text(t) => String::from_utf8_lossy(t).into_owned(),
            other => format!("{other:?}"),
        };
        let mut line = format!("{table}:");
        for i in 0..names.len() {
            line.push_str(&format!("{:?}|", row.get_ref(i)?));
        }
        let look = out.entry(format!("{collection}/{key}")).or_insert(Look {
            rows: Vec::new(),
            live: false,
        });
        look.rows.push(line);
    }
    Ok(())
}
