//! The budget: how big the storage files are, whether that is a lot, and
//! who is told. Warn only, never refuse (Kenny, 2026-10-21): the kit does
//! not stop a write and does not remove useful data because of size.
//!
//! The size of a file is `page_count * page_size` plus its write-ahead log;
//! the budget counts both files and shows the kit's part separately. It is
//! checked at start, every ten minutes and after each Storage action. Past
//! the warn line (default 40 MB of 50) the status page shows a problem,
//! `/metrics` says so and the project's `on_storage_warn` hook runs once.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;

use super::app_db::{AppDb, StorageProblem};
use super::db::{Db, FileSizes};
use crate::core::error::Error;

/// A megabyte is 1 000 000 bytes, the unit the Storage page writes sizes in,
/// so a budget of 50 MB reads "50.0 MB" there and not "52.4 MB".
const MB: u64 = 1_000_000;

/// Budget and warn line in bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub struct StorageConfig {
    pub budget_bytes: u64,
    pub warn_bytes: u64,
}

impl StorageConfig {
    pub const DEFAULT_BUDGET_MB: u64 = 50;
    pub const DEFAULT_WARN_MB: u64 = 40;

    /// The warn line defaults to 80 % of the budget (40 of 50).
    pub fn from_mb(budget_mb: u64, warn_mb: Option<u64>) -> Result<Self, Error> {
        let warn_mb_or = warn_mb.unwrap_or_else(|| (budget_mb * 4).div_ceil(5));
        if budget_mb == 0 || warn_mb_or == 0 || warn_mb_or > budget_mb {
            return Err(Error::config(
                format!(
                    "the storage warn line ({warn_mb_or} MB) must be 1 MB or more and at most the budget ({budget_mb} MB)"
                ),
                "set <PREFIX>_STORAGE_WARN_MB at or below <PREFIX>_STORAGE_BUDGET_MB",
            ));
        }
        Ok(StorageConfig {
            budget_bytes: budget_mb * MB,
            warn_bytes: warn_mb_or * MB,
        })
    }
}

impl Default for StorageConfig {
    fn default() -> Self {
        StorageConfig::from_mb(Self::DEFAULT_BUDGET_MB, Some(Self::DEFAULT_WARN_MB))
            .expect("defaults are valid")
    }
}

/// How full the budget is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
#[non_exhaustive]
pub enum Level {
    Ok,
    /// At or past the warn line.
    Warn,
    /// Past the budget itself. Still warn only: nothing is refused.
    Over,
}

/// One file's share.
#[derive(Debug, Clone, Serialize)]
#[non_exhaustive]
pub struct FileReport {
    /// `app` or `kit`.
    pub role: &'static str,
    pub file: String,
    #[serde(flatten)]
    pub sizes: FileSizes,
    pub total_bytes: u64,
    /// Whether the Storage page may delete from or compact this file. The
    /// kit's file never is.
    pub cleanable: bool,
}

/// The budget at one check.
#[derive(Debug, Clone, Serialize)]
#[non_exhaustive]
pub struct StorageReport {
    pub files: Vec<FileReport>,
    pub total_bytes: u64,
    pub budget_bytes: u64,
    pub warn_bytes: u64,
    pub level: Level,
    /// Unix seconds of the check.
    pub checked_at: u64,
}

/// Called once when the level rises (ok to warn, warn to over).
pub type WarnHook = Arc<dyn Fn(&StorageReport) + Send + Sync>;

/// Removes expired sessions from the kit file and says how many.
pub(crate) type KitPrune = Arc<dyn Fn() -> Result<u64, Error> + Send + Sync>;

/// How often the budget is rechecked.
pub const CHECK_EVERY: Duration = Duration::from_secs(600);
/// How often finished rows are pruned.
pub const PRUNE_EVERY: Duration = Duration::from_secs(24 * 3600);

struct Inner {
    cfg: StorageConfig,
    app: Option<AppDb>,
    kit: Option<Db>,
    kit_problems: Mutex<Vec<StorageProblem>>,
    /// Removes expired sessions from the kit file; set by the dashboard.
    kit_prune: Mutex<Option<KitPrune>>,
    report: Mutex<Option<StorageReport>>,
    hook: Option<WarnHook>,
}

/// The budget monitor and what the Storage API reads. Cheap to clone.
#[derive(Clone)]
pub struct Storage {
    inner: Arc<Inner>,
}

fn name_of(db: &Db) -> String {
    db.path()
        .and_then(|p| p.file_name())
        .map_or_else(String::new, |n| n.to_string_lossy().into_owned())
}

impl Storage {
    pub(crate) fn new(
        cfg: StorageConfig,
        app: Option<AppDb>,
        kit: Option<Db>,
        hook: Option<WarnHook>,
    ) -> Self {
        Storage {
            inner: Arc::new(Inner {
                cfg,
                app,
                kit,
                kit_problems: Mutex::new(Vec::new()),
                kit_prune: Mutex::new(None),
                report: Mutex::new(None),
                hook,
            }),
        }
    }

    #[cfg(feature = "dashboard")]
    pub(crate) fn add_problem(&self, p: StorageProblem) {
        self.inner
            .kit_problems
            .lock()
            .expect("problems lock")
            .push(p);
    }

    /// The kit file's handle, for the dashboard's stores.
    #[cfg(feature = "dashboard")]
    pub(crate) fn kit_db(&self) -> Option<&Db> {
        self.inner.kit.as_ref()
    }

    /// What removes expired sessions from the kit file.
    #[cfg(feature = "dashboard")]
    pub(crate) fn set_kit_prune(&self, f: KitPrune) {
        *self.inner.kit_prune.lock().expect("prune lock") = Some(f);
    }

    pub fn config(&self) -> StorageConfig {
        self.inner.cfg
    }

    pub fn app(&self) -> Option<&AppDb> {
        self.inner.app.as_ref()
    }

    /// Measure both files, remember the result, and run the warn hook when
    /// the level rose. Blocks briefly (two `PRAGMA`s per file).
    pub fn check(&self) -> Result<StorageReport, Error> {
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
        let total: u64 = files.iter().map(|f| f.total_bytes).sum();
        let cfg = self.inner.cfg;
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

    /// The last check, measuring now when there is none yet.
    pub fn report(&self) -> Result<StorageReport, Error> {
        if let Some(r) = self.inner.report.lock().expect("report lock").clone() {
            return Ok(r);
        }
        self.check()
    }

    /// Everything the status page should say about storage.
    pub fn problems(&self) -> Vec<StorageProblem> {
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

    /// Remove, on the app's side, the rows of declared kinds that are
    /// finished by their own definition, and, on the kit's side, the
    /// sessions that expired. Nothing else is ever removed on its own.
    pub fn prune_finished(&self) -> Result<(), Error> {
        if let Some(app) = &self.inner.app {
            app.prune_finished()?;
        }
        let kit_prune = self.inner.kit_prune.lock().expect("prune lock").clone();
        if let Some(f) = kit_prune {
            let removed = f()?;
            tracing::info!(
                removed,
                "storage: removed expired sessions from the kit database"
            );
        }
        Ok(())
    }

    /// The background work: the ten-minute budget check and the daily
    /// removal of rows finished by their own definition.
    pub(crate) fn spawn(&self) -> Vec<tokio::task::JoinHandle<()>> {
        let mut tasks = Vec::new();
        let me = self.clone();
        tasks.push(tokio::spawn(async move {
            let mut tick = tokio::time::interval(CHECK_EVERY);
            tick.tick().await;
            loop {
                tick.tick().await;
                let again = me.clone();
                if let Ok(Err(e)) = tokio::task::spawn_blocking(move || again.check()).await {
                    tracing::warn!(error = %e, "storage: the budget check failed");
                }
            }
        }));
        let me = self.clone();
        tasks.push(tokio::spawn(async move {
            // A minute after start, then daily.
            tokio::time::sleep(Duration::from_secs(60)).await;
            let mut tick = tokio::time::interval(PRUNE_EVERY);
            loop {
                tick.tick().await;
                let again = me.clone();
                match tokio::task::spawn_blocking(move || again.prune_finished()).await {
                    Ok(Err(e)) => {
                        tracing::warn!(error = %e, "storage: pruning finished rows failed")
                    }
                    Ok(Ok(())) => {
                        let again = me.clone();
                        let _ = tokio::task::spawn_blocking(move || again.check()).await;
                    }
                    Err(_) => {}
                }
            }
        }));
        tasks
    }

    /// `/metrics`: `<prefix>_storage_bytes{file}`, the budget, the warn line
    /// and the level (0 ok, 1 warn, 2 over).
    pub(crate) fn metrics(&self, prefix: String) -> StorageMetrics {
        StorageMetrics {
            storage: self.clone(),
            prefix,
        }
    }
}

pub(crate) struct StorageMetrics {
    storage: Storage,
    prefix: String,
}

impl crate::shell::metrics::ScrapeSource for StorageMetrics {
    fn scrape(&self) -> String {
        let Some(r) = self
            .storage
            .inner
            .report
            .lock()
            .expect("report lock")
            .clone()
        else {
            return String::new();
        };
        let p = &self.prefix;
        let mut out = format!(
            "# HELP {p}_storage_bytes Size of a storage file on disk, log included.\n# TYPE {p}_storage_bytes gauge\n"
        );
        for f in &r.files {
            out.push_str(&format!(
                "{p}_storage_bytes{{file=\"{}\"}} {}\n",
                f.role, f.total_bytes
            ));
        }
        let level = r.level as u8;
        out.push_str(&format!(
            "# HELP {p}_storage_budget_bytes The storage budget; it only warns.\n# TYPE {p}_storage_budget_bytes gauge\n{p}_storage_budget_bytes {}\n# HELP {p}_storage_warn_bytes The size at which storage warns.\n# TYPE {p}_storage_warn_bytes gauge\n{p}_storage_warn_bytes {}\n# HELP {p}_storage_level 0 ok, 1 past the warn line, 2 past the budget.\n# TYPE {p}_storage_level gauge\n{p}_storage_level {level}\n",
            r.budget_bytes, r.warn_bytes
        ));
        out
    }
}
