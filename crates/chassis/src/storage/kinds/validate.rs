//! Checking a [`DataKind`] declaration against the real schema at start, so
//! a typo is a start error and not a failed delete. Its own module because
//! it runs once and shares nothing with the selection and query code.

use rusqlite::{Connection, Transaction};

use super::query::tiebreak;
use super::{DataKind, Now, Shape, TimeFormat, ident_ok};
use crate::core::error::Error;

impl DataKind {
    /// The error for a declaration that does not fit; every check below
    /// words its reason through it.
    fn bad(&self, why: String) -> Error {
        Error::config(
            format!("storage kind `{}`: {why}", self.id),
            "fix the DataKind declaration to match the app database's schema",
        )
    }

    /// Check the declaration against the real schema, so a typo is a start
    /// error and not a failed delete.
    pub(crate) fn validate(&self, conn: &Connection) -> Result<(), Error> {
        self.validate_names()?;
        let Shape::Table { table, time } = &self.shape else {
            return Ok(());
        };
        self.validate_table(conn, table, time)
    }

    /// The id and the filter names, which need no schema to check.
    fn validate_names(&self) -> Result<(), Error> {
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
            return Err(self.bad(
                "the id must be 1-32 characters: lowercase letters, digits and `_`, starting with a letter"
                    .into(),
            ));
        }
        if matches!(self.id.as_str(), "compact" | "kit") {
            return Err(self.bad(
                "`compact` and `kit` are the Storage routes' own words; pick another id".into(),
            ));
        }
        let mut names = std::collections::BTreeSet::new();
        for f in &self.filters {
            if !names.insert(&f.name) || !ident_ok(&f.name) {
                return Err(self.bad(format!(
                    "filter name `{}` is repeated or not an identifier",
                    f.name
                )));
            }
        }
        Ok(())
    }

    /// The table, its time column, the sample ordering and the filter
    /// columns against the app database's real schema.
    fn validate_table(
        &self,
        conn: &Connection,
        table: &str,
        time: &Option<(String, TimeFormat)>,
    ) -> Result<(), Error> {
        let bad = |why: String| self.bad(why);
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
        // The samples' ordering must exist for this table (a WITHOUT ROWID
        // table has no rowid): prove it now, not at the first preview.
        let order = match time {
            Some((c, _)) => format!("\"{c}\" ASC, {}", tiebreak(conn, table)?),
            None => tiebreak(conn, table)?,
        };
        conn.prepare(&format!(
            "SELECT * FROM \"{table}\" ORDER BY {order} LIMIT 0"
        ))
        .map_err(|e| bad(format!("the samples of `{table}` cannot be ordered: {e}")))?;
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
}
