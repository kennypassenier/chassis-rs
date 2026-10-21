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
use serde_json::{Value as Json, json};

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
        }
    }

    /// A kind that is not one table.
    pub fn custom(id: &str, label: &str, ops: Arc<dyn KindOps>) -> Self {
        let mut k = DataKind::new(id, label);
        k.shape = Shape::Custom(ops);
        k
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
        matches!(&self.shape, Shape::Table { time: Some(_), .. })
    }

    /// Check the declaration against the real schema, so a typo is a start
    /// error and not a failed delete.
    pub(crate) fn validate(&self, conn: &Connection) -> Result<(), Error> {
        let bad = |why: String| {
            Error::config(
                format!("storage kind `{}`: {why}", self.id),
                "fix the DataKind declaration to match the app database's schema",
            )
        };
        let id_ok = !self.id.is_empty()
            && self.id.len() <= 32
            && self
                .id
                .chars()
                .next()
                .is_some_and(|c| c.is_ascii_lowercase())
            && self
                .id
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
        if !id_ok {
            return Err(bad(
                "the id must be 1-32 characters: lowercase letters, digits and `_`, starting with a letter"
                    .into(),
            ));
        }
        if matches!(self.id.as_str(), "compact" | "kit") {
            return Err(bad(
                "`compact` and `kit` are the Storage routes' own words; pick another id".into(),
            ));
        }
        let mut names = std::collections::BTreeSet::new();
        for f in &self.filters {
            if !names.insert(&f.name) || !ident_ok(&f.name) {
                return Err(bad(format!(
                    "filter name `{}` is repeated or not an identifier",
                    f.name
                )));
            }
        }
        let Shape::Table { table, time } = &self.shape else {
            return Ok(());
        };
        if !ident_ok(table) {
            return Err(bad(format!("`{table}` is not a table name")));
        }
        if table.starts_with("chassis_") || table.starts_with("sqlite_") {
            return Err(bad(format!("`{table}` is reserved for the kit")));
        }
        let mut stmt = conn.prepare(&format!("PRAGMA table_info(\"{table}\")"))?;
        let columns: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(1))?
            .collect::<Result<_, _>>()?;
        if columns.is_empty() {
            return Err(bad(format!("the app database has no table `{table}`")));
        }
        let has = |c: &str| columns.iter().any(|x| x == c);
        if let Some((col, _)) = time
            && !(ident_ok(col) && has(col))
        {
            return Err(bad(format!("`{table}` has no time column `{col}`")));
        }
        for f in &self.filters {
            if !(ident_ok(&f.column) && has(&f.column)) {
                return Err(bad(format!(
                    "`{table}` has no column `{}` for filter `{}`",
                    f.column, f.name
                )));
            }
        }
        Ok(())
    }

    /// Dry-run a finished-rows rule inside the caller's transaction, which
    /// the caller then rolls back: syntax and names are proven, nothing is
    /// kept.
    pub(crate) fn validate_finished(&self, tx: &Transaction) -> Result<(), Error> {
        if let Some(f) = &self.finished {
            f(tx, &Now::at(0)).map_err(|e| {
                Error::config(
                    format!(
                        "storage kind `{}`: its finished_by_definition rule does not run: {}",
                        self.id, e.message
                    ),
                    "fix the SQL fragment",
                )
            })?;
        }
        Ok(())
    }

    // ---- selection ------------------------------------------------------

    /// Turn what a person asked into an absolute, validated selection.
    pub fn resolve(&self, sel: &Selector, now: &Now) -> Result<ResolvedSelector, Error> {
        if sel.older_than_secs.is_some() && !self.supports_age() {
            return Err(Error::invalid(
                format!(
                    "`{}` has no time to compare, so it cannot be limited by age",
                    self.id
                ),
                "delete by a filter instead, or the whole kind",
            ));
        }
        for (name, value) in &sel.filters {
            let Some(f) = self.filters.iter().find(|f| &f.name == name) else {
                return Err(Error::invalid(
                    format!("`{}` has no filter `{name}`", self.id),
                    format!(
                        "use one of: {}",
                        self.filters
                            .iter()
                            .map(|f| f.name.as_str())
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                ));
            };
            match &f.kind {
                FilterKind::Choice { values } if !values.contains(value) => {
                    return Err(Error::invalid(
                        format!("`{value}` is not a value of filter `{name}`"),
                        format!("use one of: {}", values.join(", ")),
                    ));
                }
                FilterKind::Flag if value != "true" && value != "false" => {
                    return Err(Error::invalid(
                        format!("filter `{name}` is true or false, not `{value}`"),
                        "send \"true\" or \"false\"",
                    ));
                }
                FilterKind::Text if value.is_empty() || value.len() > 200 => {
                    return Err(Error::invalid(
                        format!("filter `{name}` needs 1-200 characters"),
                        "narrow the text or drop the filter",
                    ));
                }
                _ => {}
            }
        }
        Ok(ResolvedSelector {
            cutoff_secs: sel.older_than_secs.map(|s| {
                now.secs
                    .saturating_sub(i64::try_from(s).unwrap_or(i64::MAX))
            }),
            filters: sel.filters.clone(),
        })
    }

    fn supports_age(&self) -> bool {
        matches!(&self.shape, Shape::Custom(_)) || self.has_time()
    }

    /// `WHERE ...` text and its bound values for a table kind.
    fn where_sql(&self, sel: &ResolvedSelector) -> (String, Vec<Sql>) {
        let Shape::Table { time, .. } = &self.shape else {
            return (String::new(), Vec::new());
        };
        let mut parts: Vec<String> = Vec::new();
        let mut args: Vec<Sql> = Vec::new();
        if let (Some(cut), Some((col, fmt))) = (sel.cutoff_secs, time) {
            parts.push(format!("\"{col}\" < ?"));
            args.push(match fmt {
                TimeFormat::UnixSeconds => Sql::Integer(cut),
                TimeFormat::UnixMillis => Sql::Integer(cut.saturating_mul(1000)),
                TimeFormat::Rfc3339 => Sql::Text(rfc3339(cut)),
            });
        }
        for (name, value) in &sel.filters {
            let Some(f) = self.filters.iter().find(|f| &f.name == name) else {
                continue;
            };
            match &f.kind {
                FilterKind::Choice { .. } => {
                    parts.push(format!("\"{}\" = ?", f.column));
                    args.push(Sql::Text(value.clone()));
                }
                FilterKind::Flag => parts.push(if value == "true" {
                    format!("\"{}\" <> 0", f.column)
                } else {
                    format!("\"{}\" = 0", f.column)
                }),
                FilterKind::Text => {
                    parts.push(format!("\"{}\" LIKE ? ESCAPE '\\'", f.column));
                    let esc = value
                        .replace('\\', "\\\\")
                        .replace('%', "\\%")
                        .replace('_', "\\_");
                    args.push(Sql::Text(format!("%{esc}%")));
                }
            }
        }
        if parts.is_empty() {
            (String::new(), args)
        } else {
            (format!(" WHERE {}", parts.join(" AND ")), args)
        }
    }

    /// Count, estimated bytes, oldest and newest of a selection.
    pub fn stats(&self, conn: &Connection, sel: &ResolvedSelector) -> Result<KindStats, Error> {
        match &self.shape {
            Shape::Custom(ops) => ops.stats(conn, sel),
            Shape::Table { table, time } => {
                let (w, args) = self.where_sql(sel);
                let (min, max) = match time {
                    Some((c, _)) => (format!("MIN(\"{c}\")"), format!("MAX(\"{c}\")")),
                    None => ("NULL".into(), "NULL".into()),
                };
                let sql = format!("SELECT COUNT(*), {min}, {max} FROM \"{table}\"{w}");
                let (rows, lo, hi): (i64, Sql, Sql) =
                    conn.query_row(&sql, rusqlite::params_from_iter(args.iter()), |r| {
                        Ok((r.get(0)?, r.get(1)?, r.get(2)?))
                    })?;
                let fmt = time.as_ref().map(|(_, f)| *f);
                let total: i64 =
                    conn.query_row(&format!("SELECT COUNT(*) FROM \"{table}\""), [], |r| {
                        r.get(0)
                    })?;
                let table_bytes = table_bytes(conn, table).unwrap_or(0);
                let bytes = if total <= 0 {
                    0
                } else {
                    (table_bytes as u128 * rows.max(0) as u128 / total as u128) as u64
                };
                Ok(KindStats {
                    rows: rows.max(0) as u64,
                    bytes,
                    oldest: show_time(&lo, fmt),
                    newest: show_time(&hi, fmt),
                })
            }
        }
    }

    /// A few rows of a selection, oldest first, for a person to recognise.
    pub fn samples(
        &self,
        conn: &Connection,
        sel: &ResolvedSelector,
        limit: usize,
    ) -> Result<Vec<Json>, Error> {
        match &self.shape {
            Shape::Custom(ops) => ops.samples(conn, sel, limit),
            Shape::Table { table, time } => {
                let (w, args) = self.where_sql(sel);
                let order = match time {
                    Some((c, _)) => format!("\"{c}\" ASC, rowid ASC"),
                    None => "rowid ASC".into(),
                };
                let sql = format!("SELECT * FROM \"{table}\"{w} ORDER BY {order} LIMIT {limit}");
                let mut stmt = conn.prepare(&sql)?;
                let names: Vec<String> =
                    stmt.column_names().iter().map(|s| s.to_string()).collect();
                let mut rows = stmt.query(rusqlite::params_from_iter(args.iter()))?;
                let mut out = Vec::new();
                while let Some(row) = rows.next()? {
                    let mut o = serde_json::Map::new();
                    for (i, n) in names.iter().enumerate() {
                        let raw = row.get::<_, Sql>(i)?;
                        // The time column is shown as an instant, whatever
                        // the table stores, so a page never prints epoch digits.
                        let shown = match time {
                            Some((c, f)) if c == n => show_time(&raw, Some(*f)).map(Json::String),
                            _ => None,
                        };
                        o.insert(n.clone(), shown.unwrap_or_else(|| sample_value(raw)));
                    }
                    out.push(Json::Object(o));
                }
                Ok(out)
            }
        }
    }

    /// The columns a sample row shows, in the table's order, and which of
    /// them is the time column (shown as an instant). A custom kind says neither:
    /// the page then reads the keys of its first sample.
    pub fn sample_layout(&self, conn: &Connection) -> Result<(Vec<String>, Option<String>), Error> {
        match &self.shape {
            Shape::Custom(_) => Ok((Vec::new(), None)),
            Shape::Table { table, time } => {
                let mut stmt = conn.prepare(&format!("PRAGMA table_info(\"{table}\")"))?;
                // The integer primary key is the row's number in the file, not
                // something a person reads: it stays out of the sample.
                let mut columns = Vec::new();
                let mut rows = stmt.query([])?;
                while let Some(r) = rows.next()? {
                    let (name, ty, pk): (String, String, i64) = (r.get(1)?, r.get(2)?, r.get(5)?);
                    if !(pk > 0 && ty.eq_ignore_ascii_case("INTEGER")) {
                        columns.push(name);
                    }
                }
                Ok((columns, time.as_ref().map(|(c, _)| c.clone())))
            }
        }
    }

    /// Delete a selection; returns the rows removed.
    pub fn delete(&self, tx: &Transaction, sel: &ResolvedSelector) -> Result<u64, Error> {
        match &self.shape {
            Shape::Custom(ops) => ops.delete(tx, sel),
            Shape::Table { table, .. } => {
                let (w, args) = self.where_sql(sel);
                let n = tx.execute(
                    &format!("DELETE FROM \"{table}\"{w}"),
                    rusqlite::params_from_iter(args.iter()),
                )?;
                Ok(n as u64)
            }
        }
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

/// Bytes the table's pages take (dbstat), 0 when the vtab is unavailable.
fn table_bytes(conn: &Connection, table: &str) -> Option<u64> {
    conn.query_row(
        "SELECT COALESCE(SUM(pgsize), 0) FROM dbstat WHERE name = ?1",
        [table],
        |r| r.get::<_, i64>(0),
    )
    .ok()
    .map(|n| n.max(0) as u64)
}

fn show_time(v: &Sql, fmt: Option<TimeFormat>) -> Option<String> {
    match (v, fmt) {
        (Sql::Null, _) | (_, None) => None,
        (Sql::Integer(n), Some(TimeFormat::UnixSeconds)) => Some(rfc3339(*n)),
        (Sql::Integer(n), Some(TimeFormat::UnixMillis)) => Some(rfc3339(*n / 1000)),
        (Sql::Text(t), Some(TimeFormat::Rfc3339)) => Some(t.clone()),
        (Sql::Integer(n), _) => Some(n.to_string()),
        (Sql::Text(t), _) => Some(t.clone()),
        (Sql::Real(f), _) => Some(f.to_string()),
        (Sql::Blob(_), _) => None,
    }
}

fn sample_value(v: Sql) -> Json {
    match v {
        Sql::Null => Json::Null,
        Sql::Integer(n) => json!(n),
        Sql::Real(f) => json!(f),
        Sql::Text(t) if t.chars().count() > 200 => {
            json!(format!("{}…", t.chars().take(200).collect::<String>()))
        }
        Sql::Text(t) => json!(t),
        Sql::Blob(b) => json!(format!("<{} bytes>", b.len())),
    }
}
