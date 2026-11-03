//! Opt-in change capture by trigger (4.6): `SyncCollection::table("tasks",
//! "id").also("task_tags", "task_id")`.
//!
//! Recording a change by hand (`tx.sync_upsert`) is a call per write path,
//! and misses what SQL does by itself (a `ON DELETE CASCADE`, a `SET NULL`).
//! A table-backed collection instead installs triggers that mark the changed
//! key in `chassis_sync_dirty`; [`AppDb::write`](crate::storage::AppDb::write)
//! turns the marks into `sync_upsert` / `sync_delete` in the same transaction
//! (see [`track_sql`](super::track_sql)).

use super::collection::SyncCollection;
use crate::core::error::Error;

/// What a table-backed collection declares beyond a plain one.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(crate) struct Tracking {
    pub(crate) table: String,
    pub(crate) key_column: String,
    pub(crate) rev_column: String,
    /// SQL condition on the table's row: is it in the collection?
    pub(crate) live: Option<String>,
    /// `(table, column)`: rows whose `column` holds the key of the record.
    pub(crate) children: Vec<(String, String)>,
}

impl SyncCollection {
    /// A collection backed by one table: its name is the table's, `key_column`
    /// holds the key. Triggers on the table (and on every [`also`](Self::also)
    /// table) mark the changed key; `AppDb::write` records the marks in the
    /// change log in the same transaction, so SQL cascades are captured too.
    /// Must be [`shared`](Self::shared). The revision is the integer column
    /// `rev` unless [`rev_column`](Self::rev_column) says otherwise.
    ///
    /// ```text
    /// SyncCollection::table("tasks", "id").shared()
    ///     .rev_column("updated_at")
    ///     .live_when("deleted_at IS NULL")
    ///     .also("task_tags", "task_id")
    /// ```
    ///
    /// Rows that exist when the collection is first declared are recorded
    /// once at start (as [`backfill`](super::backfill) does).
    pub fn table(table: &str, key_column: &str) -> Self {
        let mut c = SyncCollection::new(table).key(key_column);
        c.tracking = Some(Tracking {
            table: table.to_string(),
            key_column: key_column.to_string(),
            rev_column: "rev".to_string(),
            ..Tracking::default()
        });
        c
    }

    /// A child table whose rows are part of the record: a change of a row
    /// whose `column` holds the record's key marks that record as changed.
    pub fn also(mut self, table: &str, column: &str) -> Self {
        self.tracking_mut()
            .children
            .push((table.into(), column.into()));
        self
    }

    /// The integer column of the table that holds the record's revision.
    pub fn rev_column(mut self, column: &str) -> Self {
        self.tracking_mut().rev_column = column.to_string();
        self
    }

    /// A SQL condition on the table's columns that says the row is in the
    /// collection (`deleted_at IS NULL`). A row that fails it, or is gone,
    /// is recorded as a delete. Default: every row is. Written by the app
    /// as a constant, never from user input.
    pub fn live_when(mut self, condition: &str) -> Self {
        self.tracking_mut().live = Some(condition.to_string());
        self
    }

    /// Whether the collection is captured by trigger.
    pub fn is_tracked(&self) -> bool {
        self.tracking.as_ref().is_some_and(|t| !t.table.is_empty())
    }

    pub(crate) fn tracking(&self) -> Option<&Tracking> {
        self.tracking.as_ref().filter(|t| !t.table.is_empty())
    }

    /// `also` and friends before `table` leave an empty table, which
    /// [`Tracking::validate`] reports at start instead of ignoring them.
    fn tracking_mut(&mut self) -> &mut Tracking {
        self.tracking.get_or_insert_with(|| Tracking {
            rev_column: "rev".into(),
            ..Tracking::default()
        })
    }
}

impl Tracking {
    pub(super) fn validate(&self, c: &SyncCollection) -> Result<(), Error> {
        let bad = |what: String, remedy: &str| {
            Error::config(format!("sync collection `{}`: {what}", c.name()), remedy)
        };
        if self.table.is_empty() {
            return Err(bad(
                "also, rev_column or live_when without table".into(),
                "start the declaration with SyncCollection::table(\"name\", \"key\")",
            ));
        }
        if !c.is_shared() {
            return Err(bad(
                "a table-backed collection must be shared".into(),
                "add .shared(); triggers cannot know the login of a row (use sync_upsert_for by hand for scoped data)",
            ));
        }
        let idents = [&self.table, &self.key_column, &self.rev_column]
            .into_iter()
            .chain(self.children.iter().flat_map(|(t, col)| [t, col]));
        for id in idents {
            if !is_ident(id) {
                return Err(bad(
                    format!("`{id}` is not a table or column name"),
                    "use letters, digits and `_`, starting with a letter or `_`",
                ));
            }
        }
        if self.live.as_ref().is_some_and(|l| l.contains(';')) {
            return Err(bad(
                "live_when holds a `;`".into(),
                "give one SQL condition, no statements",
            ));
        }
        Ok(())
    }
}

fn is_ident(s: &str) -> bool {
    let mut c = s.chars();
    s.len() <= 64
        && c.next()
            .is_some_and(|f| f.is_ascii_alphabetic() || f == '_')
        && c.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}
