//! The stores `App::start` opens before anything serves: the sqlite files,
//! the synced preferences and the notification channel, and the metrics and
//! subsystem hooks that belong to them.

use std::sync::Arc;

use super::super::App;
#[cfg(feature = "dashboard")]
use super::super::storage_open::build_prefs;
#[cfg(feature = "storage")]
use super::super::storage_open::{StorageSetup, open_storage};
use crate::core::error::Error;
use crate::shell::config_load::Loaded;

/// What `open_stores` hands the rest of `start`.
pub(super) struct Stores {
    #[cfg(feature = "storage")]
    pub(super) storage: crate::storage::Storage,
    #[cfg(feature = "dashboard")]
    pub(super) prefs: Option<crate::storage::Prefs>,
    #[cfg(all(feature = "notify", feature = "dashboard"))]
    pub(super) notify_state: Option<crate::shell::notify_api::NotifyState>,
}

impl App {
    /// Open (and migrate) the databases, build the preferences service and
    /// the notification channel, and register the store subsystem and the
    /// storage metrics.
    #[cfg_attr(not(feature = "storage"), allow(unused_variables))]
    pub(super) fn open_stores(&mut self, loaded: &Loaded) -> Result<Stores, Error> {
        // 3.11.0: the sqlite files open (and migrate) before anything reads
        // or serves; a database newer than this build stops the start here.
        #[cfg(all(feature = "storage", feature = "dashboard"))]
        let kit_db = Some(crate::storage::Db::open(
            &loaded
                .state_dir
                .join(crate::storage::kit_file_name(self.spec.name)),
            &crate::storage::kit_migrations(),
        )?);
        #[cfg(all(feature = "storage", not(feature = "dashboard")))]
        let kit_db: Option<crate::storage::Db> = None;
        #[cfg(feature = "dashboard")]
        self.validate_browser_keys()?;
        // 3.12.0: the Storage page lists the preferences table as a kind of
        // the app database, unless the project keeps them elsewhere.
        #[cfg(feature = "dashboard")]
        if self.browser_keys.is_some() && self.prefs_store.is_none() {
            self.storage_kinds.push(crate::storage::prefs_kind());
        }
        #[cfg(feature = "storage")]
        let storage = open_storage(
            loaded,
            self.spec.name,
            &self.spec.prefix(),
            kit_db,
            StorageSetup {
                app_db: self.app_db.take(),
                kinds: std::mem::take(&mut self.storage_kinds),
                budget: self.storage_budget,
                hook: self.storage_warn_hook.take(),
            },
            &mut self.dbs,
        )?;
        #[cfg(feature = "dashboard")]
        let prefs = match self.browser_keys.take() {
            None => None,
            Some(keys) => Some(build_prefs(
                loaded,
                keys,
                self.prefs_store.take(),
                storage.app(),
            )?),
        };
        // 3.15.0: the shared sender, on the kit file.
        #[cfg(all(feature = "notify", feature = "dashboard"))]
        let notify_code = self.notify_code_targets.take();
        #[cfg(all(feature = "notify", feature = "dashboard"))]
        let notify_state = match storage.kit_db() {
            Some(kit) => Some(self.start_notify_channel(loaded, kit.clone(), notify_code)?),
            None => None,
        };
        #[cfg(feature = "storage")]
        self.scrape_sources
            .push(Arc::new(storage.metrics(self.spec.metric_prefix())));
        self.subsystems
            .push(Arc::new(crate::shell::store::StoreSubsystem));
        #[cfg(feature = "notify")]
        if let Some(drain) = self.notify_drain.take() {
            tokio::spawn(drain);
        }
        Ok(Stores {
            #[cfg(feature = "storage")]
            storage,
            #[cfg(feature = "dashboard")]
            prefs,
            #[cfg(all(feature = "notify", feature = "dashboard"))]
            notify_state,
        })
    }
}
