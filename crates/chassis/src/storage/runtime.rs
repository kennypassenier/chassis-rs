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

mod background;
mod budget;
mod metrics;
mod report;
mod setting;

pub(crate) use budget::{BudgetSetup, Stored};

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

/// The largest budget the Storage page accepts, in MB (100 GB).
pub const MAX_BUDGET_MB: u64 = 100_000;

/// `chassis_meta` keys of the page setting, in the file that holds it.
const META_BUDGET: &str = "storage_budget_mb";
const META_WARN: &str = "storage_warn_mb";

/// A value that the environment or a flag fixes, and why.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[non_exhaustive]
pub struct Fixed {
    pub mb: u64,
    /// `env` or `flag`.
    pub by: &'static str,
    /// The variable or flag name.
    pub name: String,
}

impl Fixed {
    fn reason(&self) -> String {
        match self.by {
            "flag" => format!(
                "it is set by the flag {} when the service starts",
                self.name
            ),
            _ => format!(
                "it is set by the environment variable {} when the service starts",
                self.name
            ),
        }
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

impl FileReport {
    /// A file's share, for a project's own test of what it hangs on
    /// [`crate::App::on_storage_warn`] (3.12.0).
    pub fn new(role: &'static str, file: &str, sizes: FileSizes, cleanable: bool) -> Self {
        FileReport {
            role,
            file: file.to_string(),
            total_bytes: sizes.total(),
            sizes,
            cleanable,
        }
    }
}

impl StorageReport {
    /// A report built by hand, so a project can unit-test the code it hangs
    /// on [`crate::App::on_storage_warn`] without a database near the
    /// budget (3.12.0, homelab gap 139).
    pub fn new(
        files: Vec<FileReport>,
        total_bytes: u64,
        budget_bytes: u64,
        warn_bytes: u64,
        level: Level,
        checked_at: u64,
    ) -> Self {
        StorageReport {
            files,
            total_bytes,
            budget_bytes,
            warn_bytes,
            level,
            checked_at,
        }
    }
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
    cfg: Mutex<StorageConfig>,
    setup: BudgetSetup,
    stored: Mutex<Stored>,
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
        setup: BudgetSetup,
        app: Option<AppDb>,
        kit: Option<Db>,
        hook: Option<WarnHook>,
    ) -> Self {
        let cfg = {
            let (b, w, _) = setup.effective(Stored::default());
            StorageConfig::from_mb(b, Some(w)).unwrap_or_default()
        };
        let storage = Storage {
            inner: Arc::new(Inner {
                cfg: Mutex::new(cfg),
                setup,
                stored: Mutex::new(Stored::default()),
                app,
                kit,
                kit_problems: Mutex::new(Vec::new()),
                kit_prune: Mutex::new(None),
                report: Mutex::new(None),
                hook,
            }),
        };
        if let Err(e) = storage.load_setting() {
            tracing::warn!(error = %e, "storage: the budget setting could not be read; using the configured budget");
        }
        storage
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

    /// The setting as the Storage API shows it.
    pub fn setting(&self) -> serde_json::Value {
        self.setting_json()
    }

    /// Store a new budget and/or warn line (whole MB), or with `reset` remove
    /// the page setting. A value the environment or a flag fixes is refused;
    /// the budget is checked again at once. Returns the new report.
    pub fn set_budget(
        &self,
        budget_mb: Option<u64>,
        warn_mb: Option<u64>,
        reset: bool,
    ) -> Result<StorageReport, Error> {
        self.change_budget(budget_mb, warn_mb, reset)
    }

    pub fn config(&self) -> StorageConfig {
        *self.inner.cfg.lock().expect("cfg lock")
    }

    pub fn app(&self) -> Option<&AppDb> {
        self.inner.app.as_ref()
    }

    /// Measure both files, remember the result, and run the warn hook when
    /// the level rose. Blocks briefly (two `PRAGMA`s per file).
    pub fn check(&self) -> Result<StorageReport, Error> {
        self.measure()
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
        self.collect_problems()
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
}
