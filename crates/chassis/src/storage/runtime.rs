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
use super::db::{Db, FileSizes, meta_get, meta_set};
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

/// Everything below the page setting in the precedence: what the
/// environment or a flag fixed, then the code's value, then the default.
#[derive(Debug, Clone)]
pub(crate) struct BudgetSetup {
    pub fixed_budget: Option<Fixed>,
    pub fixed_warn: Option<Fixed>,
    /// `App::storage_budget` (or the default 50 MB).
    pub code_budget_mb: u64,
    /// `App::storage_budget`'s warn line, or none (40 MB, capped to the budget).
    pub code_warn_mb: Option<u64>,
    /// `App::storage_budget` was called.
    pub code_budget_set: bool,
}

impl Default for BudgetSetup {
    fn default() -> Self {
        BudgetSetup {
            fixed_budget: None,
            fixed_warn: None,
            code_budget_mb: StorageConfig::DEFAULT_BUDGET_MB,
            code_warn_mb: None,
            code_budget_set: false,
        }
    }
}

/// The page setting as kept in the file.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct Stored {
    pub budget_mb: Option<u64>,
    pub warn_mb: Option<u64>,
}

impl BudgetSetup {
    fn default_warn(&self, budget_mb: u64) -> u64 {
        // Code said a budget and no warn line: 80 % of the budget. Nothing said: the
        // default 40 MB when the budget leaves room for it, else 80 %.
        self.code_warn_mb.unwrap_or_else(|| {
            if budget_mb > StorageConfig::DEFAULT_WARN_MB && !self.code_budget_set {
                StorageConfig::DEFAULT_WARN_MB
            } else {
                eighty_percent(budget_mb)
            }
        })
    }

    /// The start refuses a configured budget and warn line that cannot hold together.
    pub(crate) fn validate_start(&self) -> Result<(), Error> {
        let (b, w) = self.defaults();
        StorageConfig::from_mb(b, Some(w)).map(|_| ())
    }

    /// What "reset to default" gives: the fixed values, else the code's.
    fn defaults(&self) -> (u64, u64) {
        let budget = self
            .fixed_budget
            .as_ref()
            .map_or(self.code_budget_mb, |f| f.mb);
        let warn = self
            .fixed_warn
            .as_ref()
            .map_or_else(|| self.default_warn(budget), |f| f.mb);
        (budget, warn)
    }

    /// Precedence: environment or flag, then the page setting, then code,
    /// then the default. A stored value that no longer fits (the budget was
    /// fixed lower since) is ignored, never an error at start.
    fn effective(&self, stored: Stored) -> (u64, u64, bool) {
        let budget = self
            .fixed_budget
            .as_ref()
            .map(|f| f.mb)
            .or(stored.budget_mb)
            .unwrap_or(self.code_budget_mb);
        let fits = |w: u64| warn_fits(budget, w);
        let warn = match (&self.fixed_warn, stored.warn_mb) {
            (Some(f), _) => (f.mb, false),
            (None, Some(w)) if fits(w) => (w, false),
            (None, Some(_)) => (self.default_warn(budget), true),
            (None, None) => (self.default_warn(budget), false),
        };
        // A warn line the budget cannot hold (code said 60 of 50 after a lower stored budget).
        (budget, warn.0.min(budget).max(1), warn.1)
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

    /// The file that keeps the page setting: the app's, else the kit's.
    fn settings_db(&self) -> Option<Db> {
        self.inner
            .app
            .as_ref()
            .and_then(|a| a.db().ok().cloned())
            .or_else(|| self.inner.kit.clone())
    }

    /// Read the page setting from its file and apply the precedence.
    fn load_setting(&self) -> Result<(), Error> {
        let Some(db) = self.settings_db() else {
            return Ok(());
        };
        let read = |c: &rusqlite::Connection, key: &str| -> Result<Option<u64>, Error> {
            Ok(meta_get(c, key)?.and_then(|v| v.trim().parse().ok()))
        };
        let stored = db.read_blocking(|c| {
            Ok(Stored {
                budget_mb: read(c, META_BUDGET)?,
                warn_mb: read(c, META_WARN)?,
            })
        })?;
        self.apply(stored);
        Ok(())
    }

    fn apply(&self, stored: Stored) {
        let (b, w, ignored) = self.inner.setup.effective(stored);
        if ignored {
            tracing::warn!(
                warn_mb = stored.warn_mb,
                "storage: the stored warn line does not fit the budget now in force; it is ignored"
            );
        }
        if let Ok(cfg) = StorageConfig::from_mb(b, Some(w)) {
            *self.inner.cfg.lock().expect("cfg lock") = cfg;
        }
        *self.inner.stored.lock().expect("stored lock") = stored;
    }

    /// The setting as the Storage API shows it.
    pub fn setting(&self) -> serde_json::Value {
        let cfg = self.config();
        let stored = *self.inner.stored.lock().expect("stored lock");
        let setup = &self.inner.setup;
        let (dbud, dwarn) = setup.defaults();
        let fixed = |f: &Option<Fixed>| match f {
            Some(f) => serde_json::json!({"by": f.by, "name": f.name, "reason": f.reason()}),
            None => serde_json::Value::Null,
        };
        serde_json::json!({
            "budget_mb": cfg.budget_bytes / MB,
            "warn_mb": cfg.warn_bytes / MB,
            "default_budget_mb": dbud,
            "default_warn_mb": dwarn,
            "stored": stored.budget_mb.is_some() || stored.warn_mb.is_some(),
            "budget_fixed": fixed(&setup.fixed_budget),
            "warn_fixed": fixed(&setup.fixed_warn),
            "min_mb": 1,
            "max_mb": MAX_BUDGET_MB,
            "can_store": self.settings_db().is_some(),
        })
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
        let db = self.settings_db().ok_or_else(|| {
            Error::config(
                "this service has no database to keep the budget in",
                "the setting is kept in the application's or the sign-in database; neither is open",
            )
        })?;
        let setup = &self.inner.setup;
        let before = self.config();
        let stored = if reset {
            Stored::default()
        } else {
            let mut next = *self.inner.stored.lock().expect("stored lock");
            if budget_mb.is_none() && warn_mb.is_none() {
                return Err(Error::invalid(
                    "nothing to change: give a budget, a warn line or reset",
                    "send budget_mb and/or warn_mb in whole megabytes, or {\"reset\": true}",
                ));
            }
            for (name, want, fixed) in [
                ("budget", budget_mb, &setup.fixed_budget),
                ("warn line", warn_mb, &setup.fixed_warn),
            ] {
                if let (Some(want), Some(f)) = (want, fixed)
                    && want != f.mb
                {
                    return Err(Error::invalid(
                        format!("the {name} is fixed at {} MB: {}", f.mb, f.reason()),
                        "change it where it is set and restart the service; this page cannot override it",
                    ));
                }
            }
            if let Some(b) = budget_mb.filter(|_| setup.fixed_budget.is_none()) {
                next.budget_mb = Some(b);
            }
            if let Some(w) = warn_mb.filter(|_| setup.fixed_warn.is_none()) {
                next.warn_mb = Some(w);
            }
            let budget = setup
                .fixed_budget
                .as_ref()
                .map(|f| f.mb)
                .or(next.budget_mb)
                .unwrap_or(setup.code_budget_mb);
            let warn = setup
                .fixed_warn
                .as_ref()
                .map(|f| f.mb)
                .or(next.warn_mb)
                .unwrap_or_else(|| setup.default_warn(budget));
            // A budget given alone keeps the warn line at 80 % when the old one no longer fits.
            if warn_mb.is_none()
                && setup.fixed_warn.is_none()
                && !warn_fits(budget, warn)
                && let Some(_) = budget_mb
            {
                next.warn_mb = Some(eighty_percent(budget));
            }
            let warn = setup
                .fixed_warn
                .as_ref()
                .map(|f| f.mb)
                .or(next.warn_mb)
                .unwrap_or_else(|| setup.default_warn(budget));
            validate_mb(budget, warn)?;
            next
        };
        db.write_blocking(move |tx| {
            for (key, value) in [(META_BUDGET, stored.budget_mb), (META_WARN, stored.warn_mb)] {
                match value {
                    Some(v) => meta_set(tx, key, &v.to_string())?,
                    None => {
                        tx.execute("DELETE FROM chassis_meta WHERE key = ?1", [key])?;
                    }
                }
            }
            Ok(())
        })?;
        self.apply(stored);
        let after = self.config();
        tracing::info!(
            audit = true,
            action = if reset { "reset" } else { "set" },
            budget_mb_before = before.budget_bytes / MB,
            warn_mb_before = before.warn_bytes / MB,
            budget_mb = after.budget_bytes / MB,
            warn_mb = after.warn_bytes / MB,
            "storage: the budget was changed from the Storage page"
        );
        self.check()
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
        *self.inner.cfg.lock().expect("cfg lock")
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

/// The page's rules for a budget and its warn line, in whole megabytes.
fn validate_mb(budget_mb: u64, warn_mb: u64) -> Result<(), Error> {
    if !(1..=MAX_BUDGET_MB).contains(&budget_mb) {
        return Err(Error::invalid(
            format!(
                "a budget of {budget_mb} MB is not allowed: use a whole number from 1 to {MAX_BUDGET_MB} MB"
            ),
            "type a whole number of megabytes between 1 and 100 000",
        ));
    }
    if !warn_fits(budget_mb, warn_mb) {
        return Err(Error::invalid(
            format!(
                "the warn line ({warn_mb} MB) must be at least 1 MB and below the budget ({budget_mb} MB)"
            ),
            "lower the warn line, or raise the budget first",
        ));
    }
    Ok(())
}

/// A warn line fits when it is 1 MB or more and below the budget (a 1 MB
/// budget can only warn at 1 MB).
fn warn_fits(budget_mb: u64, warn_mb: u64) -> bool {
    warn_mb >= 1 && (warn_mb < budget_mb || budget_mb == 1)
}

fn eighty_percent(budget_mb: u64) -> u64 {
    ((budget_mb * 4).div_ceil(5)).min(budget_mb.saturating_sub(1).max(1))
}
