//! The reading and deleting half of a table [`DataKind`]: counts and
//! estimated bytes, sample rows, the sample layout and the delete, plus the
//! helpers that put samples in a stable order and show times and values for
//! a person. Its own module because it is the one place that runs a kind's
//! SQL against its table; the declaration and the selection stay apart.

use rusqlite::types::Value as Sql;
use rusqlite::{Connection, Transaction};
use serde_json::{Value as Json, json};

use super::{DataKind, KindStats, Now, ResolvedSelector, Shape, TimeFormat, rfc3339};
use crate::core::error::Error;

impl DataKind {
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
                let tie = tiebreak(conn, table)?;
                let order = match time {
                    Some((c, _)) => format!("\"{c}\" ASC, {tie}"),
                    None => tie,
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
            Shape::Custom(_) => Ok((Vec::new(), self.custom_time.clone())),
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

/// How samples of a table are put in a stable order after the time column:
/// `rowid` for an ordinary table, the primary key for a `WITHOUT ROWID`
/// one, which has no rowid (3.12.0, homelab gap 141).
pub(super) fn tiebreak(conn: &Connection, table: &str) -> Result<String, Error> {
    let sql: String = conn
        .query_row(
            "SELECT COALESCE(sql, '') FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |r| r.get(0),
        )
        .unwrap_or_default();
    if !sql.to_ascii_uppercase().contains("WITHOUT ROWID") {
        return Ok("rowid ASC".into());
    }
    let mut stmt = conn.prepare(&format!("PRAGMA table_info(\"{table}\")"))?;
    let mut pk: Vec<(i64, String)> = Vec::new();
    let mut rows = stmt.query([])?;
    while let Some(r) = rows.next()? {
        let (name, rank): (String, i64) = (r.get(1)?, r.get(5)?);
        if rank > 0 {
            pk.push((rank, name));
        }
    }
    pk.sort();
    if pk.is_empty() {
        return Ok("1 ASC".into());
    }
    Ok(pk
        .iter()
        .map(|(_, n)| format!("\"{n}\" ASC"))
        .collect::<Vec<_>>()
        .join(", "))
}

/// Bytes the table's pages take (dbstat), 0 when the vtab is unavailable.
pub(in crate::storage) fn table_bytes(conn: &Connection, table: &str) -> Option<u64> {
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
