//! What a project declares about the local database (feat-localdb-1): the
//! collections its pages sync, how current bodies are loaded and, if it
//! keeps its data outside the app database, a source of its own.

use std::sync::Arc;

use super::App;
use super::limits::parse_u64;
use crate::core::config::Source;
use crate::core::error::Error;
use crate::shell::config_load::Loaded;
use crate::storage::Storage;
use crate::storage::sync::{
    RetentionPlan, SqliteChangeLog, SyncCollection, SyncLoad, SyncService, SyncSource,
};

impl App {
    /// feat-localdb-1: declare a collection of the local database. Served as
    /// `GET /api/sync` (the manifest) and `GET /api/sync/<name>?since=` (the
    /// feed) behind the dashboard login. Names and fields are validated at
    /// start. Needs [`App::app_db`] with [`App::sync_load`], or
    /// [`App::sync_source`]. See `docs/LOCAL_DB_DESIGN.md`.
    pub fn sync_collection(&mut self, collection: SyncCollection) -> &mut Self {
        self.sync_collections.push(collection);
        self
    }

    /// feat-localdb-1: how the feed reads the current body of an item for the
    /// collections kept in the app database (see [`SyncLoad`]).
    pub fn sync_load(&mut self, load: impl SyncLoad) -> &mut Self {
        self.sync_load = Some(Arc::new(load));
        self
    }

    /// feat-localdb-1: serve the feeds from a source of the project's own
    /// instead of the app database's change log. The project then owns
    /// retention too.
    pub fn sync_source(&mut self, source: Arc<dyn SyncSource>) -> &mut Self {
        self.sync_source = Some(source);
        self
    }

    /// Build the feeds' service, or `None` when no collection is declared.
    /// Hooks the tombstone cleanup into the storage monitor's daily run.
    pub(super) fn build_sync(
        &mut self,
        loaded: &Loaded,
        storage: &Storage,
    ) -> Result<Option<SyncService>, Error> {
        let collections = std::mem::take(&mut self.sync_collections);
        let (load, custom) = (self.sync_load.take(), self.sync_source.take());
        if collections.is_empty() {
            return match (load, custom) {
                (None, None) => Ok(None),
                _ => Err(Error::config(
                    "App::sync_load or App::sync_source was called without a collection",
                    "declare the collections with App::sync_collection",
                )),
            };
        }
        let source: Arc<dyn SyncSource> = match (custom, load, storage.app()) {
            (Some(source), _, _) => source,
            (None, Some(load), Some(app)) => {
                let log = SqliteChangeLog::new(app.clone(), load);
                let plan = RetentionPlan::new(&collections, fixed_retain_days(loaded)?);
                let pruner = log.clone();
                storage.set_sync_prune(Arc::new(move || {
                    plan.run(&pruner, crate::shell::time::now_epoch())
                }));
                Arc::new(log)
            }
            _ => {
                return Err(Error::config(
                    "App::sync_collection needs somewhere to read changes from",
                    "call App::app_db and App::sync_load, or give App::sync_source",
                ));
            }
        };
        SyncService::new(collections, source).map(Some)
    }
}

/// `<P>_SYNC_RETAIN_DAYS` when a flag, the environment or the file sets it.
fn fixed_retain_days(loaded: &Loaded) -> Result<Option<u64>, Error> {
    match loaded.source("sync_retain_days") {
        Some(Source::Flag | Source::Env | Source::File) => {
            parse_u64(loaded, "sync_retain_days", 1).map(Some)
        }
        _ => Ok(None),
    }
}
