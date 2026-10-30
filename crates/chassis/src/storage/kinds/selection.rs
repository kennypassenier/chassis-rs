//! Turning a person's [`Selector`] into a validated, absolute
//! [`ResolvedSelector`], and the `WHERE` text a table kind builds from it.
//! Its own module because it is the one place that checks what a caller may
//! ask for and the one place that turns it into SQL.

use rusqlite::types::Value as Sql;

use super::{DataKind, FilterKind, Now, ResolvedSelector, Selector, Shape, TimeFormat, rfc3339};
use crate::core::error::Error;

impl DataKind {
    /// The body of [`DataKind::resolve`]: the age needs a time to compare,
    /// every filter must exist and carry an acceptable value.
    pub(super) fn resolve_selection(
        &self,
        sel: &Selector,
        now: &Now,
    ) -> Result<ResolvedSelector, Error> {
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
            self.check_filter(name, value)?;
        }
        Ok(ResolvedSelector {
            cutoff_secs: sel.older_than_secs.map(|s| {
                now.secs
                    .saturating_sub(i64::try_from(s).unwrap_or(i64::MAX))
            }),
            filters: sel.filters.clone(),
        })
    }

    /// One filter of a selection: it must be declared, and its value must
    /// fit the filter's kind.
    fn check_filter(&self, name: &str, value: &str) -> Result<(), Error> {
        let Some(f) = self.filters.iter().find(|f| f.name == name) else {
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
            FilterKind::Choice { values } if !values.iter().any(|v| v == value) => {
                Err(Error::invalid(
                    format!("`{value}` is not a value of filter `{name}`"),
                    format!("use one of: {}", values.join(", ")),
                ))
            }
            FilterKind::Flag if value != "true" && value != "false" => Err(Error::invalid(
                format!("filter `{name}` is true or false, not `{value}`"),
                "send \"true\" or \"false\"",
            )),
            FilterKind::Text if value.is_empty() || value.len() > 200 => Err(Error::invalid(
                format!("filter `{name}` needs 1-200 characters"),
                "narrow the text or drop the filter",
            )),
            _ => Ok(()),
        }
    }

    fn supports_age(&self) -> bool {
        matches!(&self.shape, Shape::Custom(_)) || self.has_time()
    }

    /// `WHERE ...` text and its bound values for a table kind.
    pub(super) fn where_sql(&self, sel: &ResolvedSelector) -> (String, Vec<Sql>) {
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
}
