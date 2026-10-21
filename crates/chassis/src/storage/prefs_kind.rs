//! The Preferences kind on the Storage page (3.12.0).

use std::sync::Arc;

use rusqlite::{Connection, Transaction};
use serde_json::{Value as Json, json};

use super::kinds::{DataKind, KindOps, KindStats, ResolvedSelector, table_bytes};
use crate::core::error::Error;

/// The table in the app database. `chassis_` is the kit's reserved prefix,
/// so it can never clash with a table of the app.
pub(crate) const PREFS_TABLE: &str = "chassis_prefs";

/// The kit's kind on the Storage page.
pub(crate) const PREFS_KIND_ID: &str = "preferences";

/// The kind the kit registers for the table: rows, size, per-key samples
/// (key, scope, size; the value itself stays off the page), a delete by age
/// or by part of a key or scope. It never cleans itself.
pub(crate) fn prefs_kind() -> DataKind {
    use super::kinds::Filter;
    DataKind::custom(PREFS_KIND_ID, "Preferences", Arc::new(PrefsOps))
        .description("What is remembered per login across browsers: table sorting, filters, tour state. Deleting a row only resets that setting.")
        .unit("preferences")
        .custom_time_key("updated")
        .filter(Filter::text("key", "Key contains", "key"))
        .filter(Filter::text("scope", "Login scope contains", "scope"))
}

struct PrefsOps;

fn where_clause(sel: &ResolvedSelector) -> (String, Vec<rusqlite::types::Value>) {
    use rusqlite::types::Value as Sql;
    let mut parts = Vec::new();
    let mut args = Vec::new();
    if let Some(cut) = sel.cutoff_secs {
        parts.push("updated_at < ?".to_string());
        args.push(Sql::Integer(cut));
    }
    for (name, value) in &sel.filters {
        let column = match name.as_str() {
            "key" => "key",
            "scope" => "scope",
            _ => continue,
        };
        let esc = value
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        parts.push(format!("{column} LIKE ? ESCAPE '\\'"));
        args.push(Sql::Text(format!("%{esc}%")));
    }
    if parts.is_empty() {
        (String::new(), args)
    } else {
        (format!(" WHERE {}", parts.join(" AND ")), args)
    }
}

fn rfc3339(secs: i64) -> String {
    chrono::DateTime::from_timestamp(secs, 0)
        .unwrap_or_default()
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

impl KindOps for PrefsOps {
    fn stats(&self, conn: &Connection, sel: &ResolvedSelector) -> Result<KindStats, Error> {
        let (w, args) = where_clause(sel);
        let (rows, payload, lo, hi): (i64, i64, Option<i64>, Option<i64>) = conn.query_row(
            &format!(
                "SELECT COUNT(*), COALESCE(SUM(length(CAST(key AS BLOB)) + length(CAST(value AS BLOB))), 0), \
                 MIN(updated_at), MAX(updated_at) FROM {PREFS_TABLE}{w}"
            ),
            rusqlite::params_from_iter(args.iter()),
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;
        let total: i64 = conn.query_row(
            &format!(
                "SELECT COALESCE(SUM(length(CAST(key AS BLOB)) + length(CAST(value AS BLOB))), 0) FROM {PREFS_TABLE}"
            ),
            [],
            |r| r.get(0),
        )?;
        // The table's pages, scaled to the share of the payload selected.
        let bytes = if total <= 0 {
            0
        } else {
            (table_bytes(conn, PREFS_TABLE).unwrap_or(0) as u128 * payload.max(0) as u128
                / total as u128) as u64
        };
        Ok(KindStats {
            rows: rows.max(0) as u64,
            bytes,
            oldest: lo.map(rfc3339),
            newest: hi.map(rfc3339),
        })
    }

    fn samples(
        &self,
        conn: &Connection,
        sel: &ResolvedSelector,
        limit: usize,
    ) -> Result<Vec<Json>, Error> {
        let (w, args) = where_clause(sel);
        let mut stmt = conn.prepare(&format!(
            "SELECT key, scope, length(CAST(key AS BLOB)) + length(CAST(value AS BLOB)), updated_at \
             FROM {PREFS_TABLE}{w} ORDER BY updated_at ASC, scope ASC, key ASC LIMIT {limit}"
        ))?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(args.iter()), |r| {
                Ok(json!({
                    "key": r.get::<_, String>(0)?,
                    "scope": r.get::<_, String>(1)?,
                    "bytes": r.get::<_, i64>(2)?,
                    "updated": rfc3339(r.get::<_, i64>(3)?),
                }))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn delete(&self, tx: &Transaction, sel: &ResolvedSelector) -> Result<u64, Error> {
        let (w, args) = where_clause(sel);
        Ok(tx.execute(
            &format!("DELETE FROM {PREFS_TABLE}{w}"),
            rusqlite::params_from_iter(args.iter()),
        )? as u64)
    }
}
