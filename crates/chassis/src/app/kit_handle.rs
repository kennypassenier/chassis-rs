//! The kit database's one shared handle. Its own module because two callers
//! need the same open file: the self-update decision at the top of `run`
//! (before anything else opens) and `open_stores` (which hands it to the
//! storage layer, the backup pause and the dashboard's stores).

use super::App;
use crate::core::error::Error;
use crate::shell::config_load::Loaded;
use crate::storage::Db;

impl App {
    /// `<state_dir>/<name>-kit.db`, opened (and migrated) on the first call
    /// and cloned from then on. Only dashboard and self-update apps have a
    /// kit file; a `core`-only app never calls this.
    pub(super) fn kit_handle(&self, loaded: &Loaded) -> Result<Db, Error> {
        let mut slot = self.kit_handle.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(db) = slot.as_ref() {
            return Ok(db.clone());
        }
        // The plain "not writable, chown it" refusal before SQLite's own
        // "unable to open database file" (start creates a missing directory).
        crate::shell::store::probe_state_dir(&loaded.state_dir, true)?;
        let db = Db::open(
            &loaded
                .state_dir
                .join(crate::storage::kit_file_name(self.spec.name)),
            &crate::storage::kit_migrations(),
        )?;
        *slot = Some(db.clone());
        Ok(db)
    }

    /// The handle if something already opened it; never opens the file.
    #[cfg(feature = "self-update")]
    pub(super) fn kit_handle_if_open(&self) -> Option<Db> {
        self.kit_handle
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
}
