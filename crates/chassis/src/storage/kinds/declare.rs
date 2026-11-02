//! Declaring a data kind: the builder methods a project chains and the plain
//! accessors for what it declared.

use std::sync::Arc;

use rusqlite::Transaction;
use rusqlite::types::Value as Sql;

use super::{DataKind, Filter, FilterKind, KindOps, Now, Shape, TimeFormat};
use crate::core::error::Error;

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
            unit: "items".into(),
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
    #[cfg(feature = "dashboard")]
    pub(crate) fn custom_time_key(mut self, key: &str) -> Self {
        self.custom_time = Some(key.into());
        self
    }

    pub fn description(mut self, text: &str) -> Self {
        self.description = text.into();
        self
    }

    /// What this kind's rows are called in a count on the page, in the
    /// plural: `"cells"`, `"samples"`. Default `"items"`.
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
