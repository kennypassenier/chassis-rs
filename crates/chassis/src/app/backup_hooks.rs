//! What a project registers for the backup pause: extra paths, its own
//! databases, the pause mode and the pause/resume hooks.

use super::App;
use crate::core::error::Error;
use std::path::PathBuf;
use std::sync::Arc;

impl App {
    /// feat-backup-1: one more directory a backup pause holds still and
    /// `backup-pause` lists, beside the state root (data the project keeps
    /// elsewhere).
    pub fn backup_path(&mut self, path: impl Into<PathBuf>) -> &mut Self {
        self.backup_paths.push(path.into());
        self
    }

    /// 3.11.0: put a sqlite database the project opened itself
    /// ([`crate::storage::Db::open`]) under the backup pause and the
    /// pre-update copy. The pause checkpoints its log once the writes
    /// drained (a busy checkpoint falls back to stopping the unit), the copy
    /// snapshots it with `VACUUM INTO`, and its directory joins the paths
    /// `backup-pause` lists when it lies outside the state root. The kit's
    /// own files and [`App::app_db`] are registered by themselves.
    #[cfg(feature = "storage")]
    pub fn backup_db(&mut self, db: &crate::storage::Db) -> &mut Self {
        self.dbs.push(db.clone());
        self
    }

    /// Run after the socket is bound and readiness was announced, inside
    /// the runtime, on the serving path only: spawn background workers
    /// here (a pump, a poller). `--check` and the other control commands
    /// never reach it; pair it with `on_flush` to stop the workers.
    /// feat-backup-1: the least a backup pause of this service holds.
    /// `Writes` (the default) lets reads and pages answer; `Full` also
    /// answers every request but the probes 503 and tells the pause hooks
    /// to stop background work. A caller may ask for more, never less.
    pub fn backup_mode(&mut self, mode: crate::shell::backup::Mode) -> &mut Self {
        self.backup_mode = mode;
        self
    }

    /// feat-backup-1: run when a backup pause starts, after every write of
    /// the kit's state and every [`crate::shell::backup::writing`] ticket
    /// came back, before the pause is confirmed to the caller, with the
    /// mode in force. The place to bring a project's own files to rest (a
    /// SQLite `wal_checkpoint(TRUNCATE)`) and, under `Full`, to stop its
    /// pumps and pollers. An error refuses the in-process pause and the
    /// backup stops the unit instead. Must not write through the kit's
    /// stores: they are held.
    pub fn on_backup_pause(
        &mut self,
        f: impl Fn(crate::shell::backup::Mode) -> Result<(), Error> + Send + Sync + 'static,
    ) -> &mut Self {
        self.backup_pause_hooks.push(Arc::new(f));
        self
    }

    /// feat-backup-1: run when a backup pause ends, whatever ended it
    /// (`backup-resume`, the deadline, a refused pause, shutdown).
    pub fn on_backup_resume(&mut self, f: impl Fn() + Send + Sync + 'static) -> &mut Self {
        self.backup_resume_hooks.push(Arc::new(f));
        self
    }
}
