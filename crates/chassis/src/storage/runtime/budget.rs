//! The precedence behind the budget: what the environment or a flag fixed,
//! then the page setting, then the code's value, then the default, and the
//! rules a budget and its warn line must keep. Its own module because it is
//! pure arithmetic over numbers, apart from the files and the clock.

use super::{Fixed, MAX_BUDGET_MB, StorageConfig};
use crate::core::error::Error;

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
    pub(super) fn default_warn(&self, budget_mb: u64) -> u64 {
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
    pub(super) fn defaults(&self) -> (u64, u64) {
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
    pub(super) fn effective(&self, stored: Stored) -> (u64, u64, bool) {
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

/// The page's rules for a budget and its warn line, in whole megabytes.
pub(super) fn validate_mb(budget_mb: u64, warn_mb: u64) -> Result<(), Error> {
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
pub(super) fn warn_fits(budget_mb: u64, warn_mb: u64) -> bool {
    warn_mb >= 1 && (warn_mb < budget_mb || budget_mb == 1)
}

pub(super) fn eighty_percent(budget_mb: u64) -> u64 {
    ((budget_mb * 4).div_ceil(5)).min(budget_mb.saturating_sub(1).max(1))
}
