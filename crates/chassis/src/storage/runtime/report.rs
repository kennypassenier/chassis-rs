//! Measuring the files against the budget: the report, the level, the warn
//! hook and the problems the status page shows. Its own module because it
//! is the read side of the monitor; the setting it measures against and the
//! timers that call it live elsewhere.

use super::{FileReport, Level, MB, Storage, StorageReport, name_of};
use crate::core::error::Error;
use crate::storage::app_db::StorageProblem;

impl Storage {
    /// Fold each write-ahead log into its database and trim it to nothing,
    /// so the Storage page's "pending writes" shows what is really pending
    /// (Kenny, 2026-10-30: kyu and almanac showed about 4 MB beside a 40 KB
    /// kit file). A busy log is left for the next round.
    pub(crate) fn settle_logs(&self) {
        let app = self.inner.app.as_ref().and_then(|a| a.db().ok());
        for db in app.into_iter().chain(self.inner.kit.iter()) {
            if let Err(e) = db.checkpoint() {
                tracing::debug!(error = %e, "storage: the write-ahead log stays for the next round");
            }
        }
    }

    /// The body of [`Storage::check`].
    pub(super) fn measure(&self) -> Result<StorageReport, Error> {
        let files = self.file_reports()?;
        let total: u64 = files.iter().map(|f| f.total_bytes).sum();
        let cfg = self.config();
        let level = if total > cfg.budget_bytes {
            Level::Over
        } else if total >= cfg.warn_bytes {
            Level::Warn
        } else {
            Level::Ok
        };
        let report = StorageReport {
            files,
            total_bytes: total,
            budget_bytes: cfg.budget_bytes,
            warn_bytes: cfg.warn_bytes,
            level,
            checked_at: crate::shell::time::now_epoch(),
        };
        let before = self
            .inner
            .report
            .lock()
            .expect("report lock")
            .replace(report.clone())
            .map_or(Level::Ok, |r| r.level);
        if level > before {
            tracing::warn!(
                total_bytes = total,
                budget_bytes = cfg.budget_bytes,
                warn_bytes = cfg.warn_bytes,
                level = ?level,
                "storage: the files passed the warn line; nothing is refused, open the Storage page to clean up"
            );
            if let Some(hook) = &self.inner.hook {
                hook(&report);
            }
        }
        Ok(report)
    }

    /// One report per open file: the app's (cleanable) and the kit's.
    fn file_reports(&self) -> Result<Vec<FileReport>, Error> {
        let mut files = Vec::new();
        if let Some(app) = self.inner.app.as_ref().and_then(|a| a.db().ok()) {
            let sizes = app.sizes()?;
            files.push(FileReport {
                role: "app",
                file: name_of(app),
                sizes,
                total_bytes: sizes.total(),
                cleanable: true,
            });
        }
        if let Some(kit) = &self.inner.kit {
            let sizes = kit.sizes()?;
            files.push(FileReport {
                role: "kit",
                file: name_of(kit),
                sizes,
                total_bytes: sizes.total(),
                cleanable: false,
            });
        }
        Ok(files)
    }

    /// The body of [`Storage::problems`].
    pub(super) fn collect_problems(&self) -> Vec<StorageProblem> {
        let mut out = self
            .inner
            .kit_problems
            .lock()
            .expect("problems lock")
            .clone();
        if let Some(app) = &self.inner.app {
            out.extend(app.problems());
        }
        if let Some(r) = self.inner.report.lock().expect("report lock").as_ref()
            && r.level != Level::Ok
        {
            let mb = |b: u64| format!("{:.1} MB", b as f64 / MB as f64);
            out.push(StorageProblem {
                what: format!("storage is {} of a {} budget", mb(r.total_bytes), mb(r.budget_bytes)),
                why: if r.level == Level::Over {
                    "the files are past the budget; nothing is refused, but they only grow".into()
                } else {
                    format!("the files passed the warn line ({}); nothing is refused", mb(r.warn_bytes))
                },
                remedy: "open the Storage page, preview what you no longer need, delete it and compact the app file".into(),
            });
        }
        out
    }
}
