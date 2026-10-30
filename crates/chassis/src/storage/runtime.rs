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
mod construct;
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

impl Storage {}
