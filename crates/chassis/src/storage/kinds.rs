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

mod declare;
mod query;
mod selection;
mod validate;

pub(in crate::storage) use query::table_bytes;
