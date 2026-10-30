//! Building a `Storage` monitor and wiring it: the constructor, the problems
//! the opening found and the kit database and its pruner.

use std::sync::{Arc, Mutex};

use super::{BudgetSetup, Inner, KitPrune, Storage, StorageConfig, Stored, WarnHook};
use crate::storage::app_db::{AppDb, StorageProblem};
use crate::storage::db::Db;

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

    pub fn app(&self) -> Option<&AppDb> {
        self.inner.app.as_ref()
    }
}
