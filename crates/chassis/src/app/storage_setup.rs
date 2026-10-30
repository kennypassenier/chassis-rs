//! What a project declares about its storage: the app database, data kinds,
//! budget, warn hook and browser preference sync.

use super::App;
#[cfg(feature = "storage")]
use crate::core::error::Error;
#[cfg(any(feature = "storage", feature = "dashboard"))]
use std::sync::Arc;

impl App {
    /// 3.11.0: the app's own database, `<state_dir>/<name>.db`. Returns a
    /// handle at once; the file opens at start, so `--check` and
    /// `--version` create nothing. The migrations are a numbered list, each
    /// atomic; a database newer than this build is refused. The optional
    /// import runs once in one transaction (see
    /// [`crate::storage::AppDbSpec`]). The file is under the backup pause,
    /// the pre-update copy and the storage budget without further ado.
    /// Call it once.
    #[cfg(feature = "storage")]
    pub fn app_db(
        &mut self,
        spec: crate::storage::AppDbSpec,
    ) -> Result<crate::storage::AppDb, Error> {
        if self.app_db.is_some() {
            return Err(Error::config(
                "App::app_db was called twice",
                "a service has one app database; keep the handle the first call returned",
            ));
        }
        let handle = crate::storage::AppDb::unopened()?;
        self.app_db = Some((handle.clone(), spec));
        Ok(handle)
    }

    /// 3.11.0: declare a kind of data in the app database, for the Storage
    /// page and the daily removal of rows finished by their own
    /// definition. Validated against the schema at start.
    #[cfg(feature = "storage")]
    pub fn storage_kind(&mut self, kind: crate::storage::DataKind) -> &mut Self {
        self.storage_kinds.push(kind);
        self
    }

    /// 3.11.0: the storage budget in megabytes (default 50) and the line at
    /// which it starts to warn (default 80 % of the budget, 40 of 50). A
    /// `<P>_STORAGE_BUDGET_MB` / `<P>_STORAGE_WARN_MB` setting wins. The
    /// budget only ever warns; a write is never refused for size.
    #[cfg(feature = "storage")]
    pub fn storage_budget(&mut self, budget_mb: u64, warn_mb: Option<u64>) -> &mut Self {
        self.storage_budget = Some((budget_mb, warn_mb));
        self
    }

    /// 3.11.0: run once when the storage files rise past the warn line (and
    /// again past the budget), with the report the Storage page shows.
    #[cfg(feature = "storage")]
    pub fn on_storage_warn(
        &mut self,
        f: impl Fn(&crate::storage::StorageReport) + Send + Sync + 'static,
    ) -> &mut Self {
        self.storage_warn_hook = Some(Arc::new(f));
        self
    }

    /// 3.12.0: sync these `localStorage` keys of the browser to the app
    /// database, per login, so a person's preferences follow them across
    /// devices. Only the declared keys sync, and **a secret must never be
    /// declared**: values are plain text in the database and in the page. The
    /// declaration also refuses names that look like secrets. Needs
    /// [`App::app_db`] (the preferences are a table of it) unless a store is
    /// given with [`App::prefs_store`]. See `docs/DASHBOARD.md`.
    #[cfg(feature = "dashboard")]
    pub fn sync_browser_keys(&mut self, keys: crate::storage::BrowserKeys) -> &mut Self {
        self.browser_keys = Some(keys);
        self
    }

    /// 3.12.0: keep the synced preferences in a store of the project's own
    /// (another adapter of [`crate::storage::PrefStore`]) instead of the
    /// app database. The Storage page then lists no Preferences kind.
    #[cfg(feature = "dashboard")]
    pub fn prefs_store(&mut self, store: Arc<dyn crate::storage::PrefStore>) -> &mut Self {
        self.prefs_store = Some(store);
        self
    }
}
