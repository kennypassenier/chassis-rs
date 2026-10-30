//! The Storage page's operations on an [`AppDb`]: the overview, the
//! read-only preview, the confirmed delete and the pruning of finished
//! rows. Its own module because this is the only code that deletes, and
//! it stays small enough to read in one go.

use rusqlite::Transaction;

use super::{AppDb, Deleted, KindOverview, Preview, TokenBody};
use crate::core::error::{Error, Kind};
use crate::storage::kinds::{DataKind, KindStats, Now, ResolvedSelector, Selector};

impl AppDb {
    pub(crate) fn preview_at(
        &self,
        kind: &str,
        sel: &Selector,
        now: &Now,
    ) -> Result<Preview, Error> {
        let k = self.kind(kind)?;
        let resolved = k.resolve(sel, now)?;
        let (stats, samples, (columns, time_column)) = self.read_blocking(|c| {
            Ok((
                k.stats(c, &resolved)?,
                k.samples(c, &resolved, 5)?,
                k.sample_layout(c)?,
            ))
        })?;
        let token = self.sign(&TokenBody {
            kind: kind.into(),
            asked: sel.clone(),
            selector: resolved,
            rows: stats.rows,
            issued: now.secs,
        });
        Ok(Preview {
            kind: kind.into(),
            label: k.label().into(),
            stats,
            samples,
            columns,
            time_column,
            confirm_with: k.label().into(),
            token,
        })
    }

    pub(crate) fn delete_at(
        &self,
        kind: &str,
        sel: &Selector,
        token: &str,
        confirm: &str,
        now: &Now,
    ) -> Result<Deleted, Error> {
        let k = self.kind(kind)?;
        if confirm.trim() != k.label() {
            return Err(Error::invalid(
                format!(
                    "what was typed, `{}`, is not the kind's name",
                    confirm.trim()
                ),
                format!("type `{}` exactly as shown to confirm", k.label()),
            ));
        }
        let body = self.verify(token, now)?;
        // The delete must ask for exactly what was previewed; the age was
        // fixed then as an absolute instant (`body.selector.cutoff_secs`).
        k.resolve(sel, now)?;
        if body.kind != kind || body.asked != *sel {
            return Err(Error::invalid(
                "the delete does not match the preview it carries",
                "preview the selection again and confirm that one",
            ));
        }
        let deleted = self.write_blocking(|tx| {
            let now_rows = k.stats_tx(tx, &body.selector)?.rows;
            if now_rows != body.rows {
                return Err(Error::invalid(
                    format!(
                        "the selection held {} row(s) at the preview and holds {now_rows} now; nothing was deleted",
                        body.rows
                    ),
                    "preview again and confirm the new count",
                ));
            }
            let n = k.delete(tx, &body.selector)?;
            if n != body.rows {
                return Err(Error::internal(
                    format!("the delete removed {n} row(s) but {} were previewed; rolled back", body.rows),
                    "report this",
                ));
            }
            Ok(n)
        })?;
        let remaining = self.read_blocking(|c| {
            k.stats(
                c,
                &ResolvedSelector {
                    cutoff_secs: None,
                    filters: Default::default(),
                },
            )
        })?;
        let sizes = self.sizes()?;
        tracing::info!(
            audit = true,
            kind,
            deleted,
            selector = %serde_json::to_string(&body.selector).unwrap_or_default(),
            remaining = remaining.rows,
            "storage: rows deleted from the Storage page"
        );
        Ok(Deleted {
            kind: kind.into(),
            deleted,
            remaining: remaining.rows,
            reclaimable_bytes: sizes.reclaimable_bytes,
        })
    }

    pub(super) fn kind(&self, id: &str) -> Result<&DataKind, Error> {
        self.kinds().iter().find(|k| k.id() == id).ok_or_else(|| {
            Error::new(
                Kind::NotFound,
                format!("there is no kind of data called `{id}`"),
                format!(
                    "use one of: {}",
                    self.kinds()
                        .iter()
                        .map(DataKind::id)
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            )
        })
    }

    /// One row per declared kind: rows, estimated bytes, oldest, newest.
    pub fn overview(&self) -> Result<Vec<KindOverview>, Error> {
        let whole = ResolvedSelector {
            cutoff_secs: None,
            filters: Default::default(),
        };
        self.read_blocking(|c| {
            self.kinds()
                .iter()
                .map(|k| {
                    Ok(KindOverview {
                        id: k.id().into(),
                        label: k.label().into(),
                        description: k.describe().into(),
                        stats: k.stats(c, &whole)?,
                        filters: k.filters().to_vec(),
                        unit: k.unit_word().into(),
                        supports_age: k.has_time(),
                        finished_automatically: k.has_finished_rule(),
                    })
                })
                .collect()
        })
    }

    /// Read-only: how many rows, how many bytes, oldest, newest, five
    /// samples, and the token a delete must present.
    pub fn preview(&self, kind: &str, sel: &Selector) -> Result<Preview, Error> {
        self.preview_at(kind, sel, &Now::current())
    }

    /// Delete exactly what the preview showed: the confirmation must be the
    /// kind's name, the token must be ours, fresh and for this kind and
    /// selector, and the rows are recounted inside the transaction. If the
    /// count moved since the preview nothing is deleted.
    pub fn delete(
        &self,
        kind: &str,
        sel: &Selector,
        token: &str,
        confirm: &str,
    ) -> Result<Deleted, Error> {
        self.delete_at(kind, sel, token, confirm, &Now::current())
    }

    /// Remove, from every kind that declared a rule, the rows finished by
    /// their own definition. Returns `(kind, removed)` per kind with a rule.
    /// Kinds without a rule, and tables that are no kind, are untouched.
    pub fn prune_finished(&self) -> Result<Vec<(String, u64)>, Error> {
        self.prune_finished_at(&Now::current())
    }

    /// [`AppDb::prune_finished`] at a chosen instant, so a project can test
    /// its `finished_by_definition` rules without waiting for the clock
    /// (3.12.0, homelab gap 139).
    pub fn prune_finished_at(&self, now: &Now) -> Result<Vec<(String, u64)>, Error> {
        if !self.kinds().iter().any(DataKind::has_finished_rule) {
            return Ok(Vec::new());
        }
        let out = self.write_blocking(|tx| {
            let mut out = Vec::new();
            for k in self.kinds() {
                if let Some(n) = k.prune_finished(tx, now)? {
                    out.push((k.id().to_string(), n));
                }
            }
            Ok(out)
        })?;
        for (kind, removed) in &out {
            tracing::info!(kind = %kind, removed, "storage: pruned rows finished by their own definition");
        }
        Ok(out)
    }
}

impl DataKind {
    /// A recount inside the delete's own transaction.
    fn stats_tx(&self, tx: &Transaction, sel: &ResolvedSelector) -> Result<KindStats, Error> {
        self.stats(tx, sel)
    }
}
