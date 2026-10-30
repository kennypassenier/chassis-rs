//! The budget setting the Storage page keeps: where it is stored, how it is
//! read and applied under the precedence, how a change is validated and
//! written, and how it is shown. Its own module because it is the only code
//! of the monitor that writes to a database. The public `setting`,
//! `set_budget` and `config` of `Storage` sit here.

use super::budget::{eighty_percent, validate_mb, warn_fits};
use super::{
    Fixed, MAX_BUDGET_MB, MB, META_BUDGET, META_WARN, Storage, StorageConfig, StorageReport, Stored,
};
use crate::core::error::Error;
use crate::storage::db::{Db, meta_get, meta_set};

impl Storage {
    /// The file that keeps the page setting: the app's, else the kit's.
    fn settings_db(&self) -> Option<Db> {
        self.inner
            .app
            .as_ref()
            .and_then(|a| a.db().ok().cloned())
            .or_else(|| self.inner.kit.clone())
    }

    /// Read the page setting from its file and apply the precedence.
    pub(super) fn load_setting(&self) -> Result<(), Error> {
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

    /// The setting a change would store: refuse a fixed value, apply the
    /// given ones over what is stored and check they hold together.
    fn next_stored(&self, budget_mb: Option<u64>, warn_mb: Option<u64>) -> Result<Stored, Error> {
        let setup = &self.inner.setup;
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
        Ok(next)
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
        let before = self.config();
        let stored = if reset {
            Stored::default()
        } else {
            self.next_stored(budget_mb, warn_mb)?
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

    pub fn config(&self) -> StorageConfig {
        *self.inner.cfg.lock().expect("cfg lock")
    }
}
