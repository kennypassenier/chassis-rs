//! Kinds of data in the app's file: what the Storage page lists, previews
//! and deletes, and what may be pruned on its own.
//!
//! A project declares each kind of data it keeps ([`DataKind`]): a table, a
//! time column, the filters a person may narrow by, and optionally what
//! makes a row FINISHED BY ITS OWN DEFINITION (an expired session, an ended
//! snooze). Only those rows are ever removed automatically (Kenny,
//! 2026-10-21); everything else goes through a preview and a typed
//! confirmation. A kind that is not one table implements [`KindOps`].
//!
//! All SQL here is built from names validated at start against the real
//! schema; every value is a bound parameter. Nothing in this module can
//! name a table that is not a declared kind, and the kit's own file is not
//! reachable from it at all (it takes an [`super::AppDb`]'s connection).

use std::collections::BTreeMap;
use std::sync::Arc;

use rusqlite::types::Value as Sql;
use rusqlite::{Connection, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value as Json;

use crate::core::error::Error;

/// How a time column stores its instants.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[non_exhaustive]
pub enum TimeFormat {
    /// Integer seconds since the Unix epoch.
    #[default]
    UnixSeconds,
    /// Integer milliseconds since the Unix epoch.
    UnixMillis,
    /// Text `YYYY-MM-DDTHH:MM:SSZ` (UTC), which sorts as text.
    Rfc3339,
}

/// The current instant in the three formats a time column may use, so a
/// pruning clause and a cutoff agree on one `now`.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub struct Now {
    pub secs: i64,
}

impl Now {
    pub fn at(secs: i64) -> Self {
        Now { secs }
    }

    pub fn current() -> Self {
        Now::at(crate::shell::time::now_epoch() as i64)
    }

    fn rfc3339(&self) -> String {
        rfc3339(self.secs)
    }
}

fn rfc3339(secs: i64) -> String {
    chrono::DateTime::from_timestamp(secs, 0)
        .unwrap_or_default()
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// What a person may narrow a kind by.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[non_exhaustive]
pub enum FilterKind {
    /// One of a declared set of values (`column = ?`).
    Choice { values: Vec<String> },
    /// A yes/no column (`column <> 0` / `column = 0`).
    Flag,
    /// Text contained in the column (case-insensitive for ASCII).
    Text,
}

/// One declared filter of a kind.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[non_exhaustive]
pub struct Filter {
    pub name: String,
    pub label: String,
    #[serde(skip)]
    pub column: String,
    #[serde(flatten)]
    pub kind: FilterKind,
}

impl Filter {
    pub fn choice(
        name: &str,
        label: &str,
        column: &str,
        values: impl IntoIterator<Item = impl Into<String>>,
    ) -> Self {
        Filter {
            name: name.into(),
            label: label.into(),
            column: column.into(),
            kind: FilterKind::Choice {
                values: values.into_iter().map(Into::into).collect(),
            },
        }
    }

    pub fn flag(name: &str, label: &str, column: &str) -> Self {
        Filter {
            name: name.into(),
            label: label.into(),
            column: column.into(),
            kind: FilterKind::Flag,
        }
    }

    pub fn text(name: &str, label: &str, column: &str) -> Self {
        Filter {
            name: name.into(),
            label: label.into(),
            column: column.into(),
            kind: FilterKind::Text,
        }
    }
}

/// Which rows of a kind: older than some age, and/or matching filters.
/// An empty selector is the whole kind.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[non_exhaustive]
pub struct Selector {
    /// Only rows whose time column is at least this many seconds old.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub older_than_secs: Option<u64>,
    /// Filter name to value (`"true"`/`"false"` for a flag).
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub filters: BTreeMap<String, String>,
}

impl Selector {
    /// The whole kind.
    pub fn all() -> Self {
        Selector::default()
    }

    /// Only rows at least this many seconds old.
    pub fn older_than(mut self, secs: u64) -> Self {
        self.older_than_secs = Some(secs);
        self
    }

    /// Narrow by a declared filter.
    pub fn with_filter(mut self, name: &str, value: &str) -> Self {
        self.filters.insert(name.into(), value.into());
        self
    }
}

/// What a selection holds.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[non_exhaustive]
pub struct KindStats {
    pub rows: u64,
    /// Estimated: the table's share of the file, scaled to the selection.
    pub bytes: u64,
    /// RFC 3339 for a time column; `None` for no rows or no time column.
    pub oldest: Option<String>,
    pub newest: Option<String>,
}

/// For a kind that is not one table: the three things the page needs. The
/// kit validates the selector (filter names, values) before calling.
pub trait KindOps: Send + Sync {
    fn stats(&self, conn: &Connection, sel: &ResolvedSelector) -> Result<KindStats, Error>;
    fn samples(
        &self,
        conn: &Connection,
        sel: &ResolvedSelector,
        limit: usize,
    ) -> Result<Vec<Json>, Error>;
    fn delete(&self, tx: &Transaction, sel: &ResolvedSelector) -> Result<u64, Error>;
}

/// A [`Selector`] with its age turned into an absolute instant.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[non_exhaustive]
pub struct ResolvedSelector {
    /// Rows strictly older than this unix second.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cutoff_secs: Option<i64>,
    #[serde(default)]
    pub filters: BTreeMap<String, String>,
}

type Finisher = Arc<dyn Fn(&Transaction, &Now) -> Result<u64, Error> + Send + Sync>;

#[derive(Clone)]
enum Shape {
    Table {
        table: String,
        time: Option<(String, TimeFormat)>,
    },
    Custom(Arc<dyn KindOps>),
}

/// One kind of data the app keeps.
#[derive(Clone)]
pub struct DataKind {
    id: String,
    label: String,
    description: String,
    unit: String,
    shape: Shape,
    filters: Vec<Filter>,
    finished: Option<Finisher>,
    /// For a custom kind: the sample key that holds an instant, so the page
    /// formats it as a date and offers "older than".
    custom_time: Option<String>,
}

impl std::fmt::Debug for DataKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DataKind").field("id", &self.id).finish()
    }
}

fn ident_ok(s: &str) -> bool {
    let mut c = s.chars();
    c.next()
        .is_some_and(|f| f.is_ascii_alphabetic() || f == '_')
        && c.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

impl DataKind {
    /// A kind named `id` (lowercase letters, digits and `_`, starting with a
    /// letter; the name a script uses in a route) shown as `label`, which is
    /// also what a person types to confirm a delete. Add `.table(..)` or
    /// build it with [`DataKind::custom`].
    pub fn new(id: &str, label: &str) -> Self {
        DataKind {
            id: id.into(),
            label: label.into(),
            description: String::new(),
            unit: "rows".into(),
            shape: Shape::Table {
                table: String::new(),
                time: None,
            },
            filters: Vec::new(),
            finished: None,
            custom_time: None,
        }
    }

    /// A kind that is not one table.
    pub fn custom(id: &str, label: &str, ops: Arc<dyn KindOps>) -> Self {
        let mut k = DataKind::new(id, label);
        k.shape = Shape::Custom(ops);
        k
    }

    /// A custom kind whose samples carry an instant (RFC 3339) under `key`
    /// and whose ops honour the selector's age cutoff.
    pub(crate) fn custom_time_key(mut self, key: &str) -> Self {
        self.custom_time = Some(key.into());
        self
    }

    pub fn description(mut self, text: &str) -> Self {
        self.description = text.into();
        self
    }

    /// What this kind's rows are called in a count on the page, in the
    /// plural: `"cells"`, `"samples"`. Default `"rows"`.
    pub fn unit(mut self, plural: &str) -> Self {
        self.unit = plural.into();
        self
    }

    /// The table this kind is.
    pub fn table(mut self, table: &str) -> Self {
        if let Shape::Table { table: t, .. } = &mut self.shape {
            *t = table.into();
        }
        self
    }

    /// The column "older than" compares, and how it stores instants.
    pub fn time_column(mut self, column: &str, format: TimeFormat) -> Self {
        if let Shape::Table { time, .. } = &mut self.shape {
            *time = Some((column.into(), format));
        }
        self
    }

    pub fn filter(mut self, f: Filter) -> Self {
        self.filters.push(f);
        self
    }

    /// Rows of a table kind that are finished by their own definition: a
    /// `WHERE` fragment that may use `:now` (unix seconds), `:now_ms` and
    /// `:now_rfc3339`. These rows, and only these, are removed daily
    /// without a person asking. Example: `expires_at < :now`.
    pub fn finished_by_definition(mut self, where_sql: &str) -> Self {
        let table = match &self.shape {
            Shape::Table { table, .. } => table.clone(),
            Shape::Custom(_) => return self,
        };
        let sql = format!("DELETE FROM \"{table}\" WHERE ({where_sql})");
        self.finished = Some(Arc::new(move |tx, now| {
            let mut stmt = tx.prepare(&sql)?;
            let all: [(&str, Sql); 3] = [
                (":now", Sql::Integer(now.secs)),
                (":now_ms", Sql::Integer(now.secs * 1000)),
                (":now_rfc3339", Sql::Text(now.rfc3339())),
            ];
            let mut bound: Vec<(&str, &dyn rusqlite::ToSql)> = Vec::new();
            for (name, value) in &all {
                if stmt.parameter_index(name)?.is_some() {
                    bound.push((name, value));
                }
            }
            Ok(stmt.execute(&*bound)? as u64)
        }));
        self
    }

    /// The same for a custom kind: code that removes its finished rows and
    /// says how many.
    pub fn finished_by(
        mut self,
        f: impl Fn(&Transaction, &Now) -> Result<u64, Error> + Send + Sync + 'static,
    ) -> Self {
        self.finished = Some(Arc::new(f));
        self
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn label(&self) -> &str {
        &self.label
    }

    pub fn filters(&self) -> &[Filter] {
        &self.filters
    }

    /// Whether some rows of this kind are removed automatically.
    pub fn has_finished_rule(&self) -> bool {
        self.finished.is_some()
    }

    pub(crate) fn describe(&self) -> &str {
        &self.description
    }

    pub(crate) fn unit_word(&self) -> &str {
        &self.unit
    }

    pub(crate) fn has_time(&self) -> bool {
        matches!(&self.shape, Shape::Table { time: Some(_), .. }) || self.custom_time.is_some()
    }

    /// Turn what a person asked into an absolute, validated selection.
    pub fn resolve(&self, sel: &Selector, now: &Now) -> Result<ResolvedSelector, Error> {
        self.resolve_selection(sel, now)
    }

    /// Count, estimated bytes, oldest and newest of a selection.
    pub fn stats(&self, conn: &Connection, sel: &ResolvedSelector) -> Result<KindStats, Error> {
        self.stats_impl(conn, sel)
    }

    /// A few rows of a selection, oldest first, for a person to recognise.
    pub fn samples(
        &self,
        conn: &Connection,
        sel: &ResolvedSelector,
        limit: usize,
    ) -> Result<Vec<Json>, Error> {
        self.samples_impl(conn, sel, limit)
    }

    /// The columns a sample row shows, in the table's order, and which of
    /// them is the time column (shown as an instant). A custom kind says neither:
    /// the page then reads the keys of its first sample.
    pub fn sample_layout(&self, conn: &Connection) -> Result<(Vec<String>, Option<String>), Error> {
        self.sample_layout_impl(conn)
    }

    /// Delete a selection; returns the rows removed.
    pub fn delete(&self, tx: &Transaction, sel: &ResolvedSelector) -> Result<u64, Error> {
        self.delete_impl(tx, sel)
    }

    /// Remove the rows finished by their own definition; `None` when this
    /// kind declares no such rule.
    pub(crate) fn prune_finished(&self, tx: &Transaction, now: &Now) -> Result<Option<u64>, Error> {
        match &self.finished {
            Some(f) => Ok(Some(f(tx, now)?)),
            None => Ok(None),
        }
    }
}

mod query;
mod selection;
mod validate;

pub(in crate::storage) use query::table_bytes;
