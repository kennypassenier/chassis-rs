//! Construction of the [`Updater`] and the files it keeps next to the binary
//! and the handle on the update tables of the kit database (`.prev`,
//! `.staging` and `.drill` stay files: they are binaries and markers).
//! Its own module so the path layout sits in one place, away from the
//! network and install logic.

use super::store::{UpdateStore, open_kit_file};
use super::*;

impl Updater {
    pub(super) fn prev_path(&self) -> PathBuf {
        with_suffix(&self.binary, ".prev")
    }

    pub(super) fn staging_path(&self) -> PathBuf {
        with_suffix(&self.binary, ".staging")
    }

    pub(super) fn drill_path(&self) -> PathBuf {
        with_suffix(&self.binary, ".drill")
    }

    /// The update tables of the kit database. Opens the kit file on first
    /// use (creating it) unless [`Updater::with_kit_db`] supplied the handle.
    pub(super) fn store(&self) -> Result<&UpdateStore, Error> {
        if let Some(s) = self.store.get() {
            return Ok(s);
        }
        let opened = open_kit_file(&self.state_dir, &self.kit_file_name())?;
        Ok(self.store.get_or_init(|| opened))
    }

    /// Like [`Updater::store`] for a read: when no kit file exists yet and no
    /// old update file waits to be imported, there is nothing to read and
    /// nothing is created (an operator running `<name> update` by hand must
    /// not leave a kit file owned by the wrong user behind).
    fn store_for_read(&self) -> Result<Option<&UpdateStore>, Error> {
        let untouched = self.store.get().is_none()
            && !self.state_dir.join(self.kit_file_name()).exists()
            && !self.state_dir.join("update-state.json").exists()
            && !self.state_dir.join("update-skip.json").exists();
        if untouched {
            return Ok(None);
        }
        self.store().map(Some)
    }

    /// `<binary name>-kit.db`: the kit file's name when the app gave no
    /// handle. `App` always does, with `AppSpec.name`.
    fn kit_file_name(&self) -> String {
        let bin = self
            .binary
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        crate::storage::kit_file_name(&bin)
    }

    /// Use the app's open kit database instead of opening the file again,
    /// and bring any old `update-state.json` / `update-skip.json` in.
    pub fn with_kit_db(self, db: crate::storage::Db) -> Result<Self, Error> {
        let store = UpdateStore::with_db(db, &self.state_dir)?;
        self.store.set(store).map_err(|_| {
            Error::internal(
                "the updater already has its kit database",
                "call with_kit_db once, before the first check",
            )
        })?;
        Ok(self)
    }

    /// The update on probation, if one is pending.
    pub fn pending_state(&self) -> Result<Option<UpdateState>, Error> {
        self.store_for_read()?.map_or(Ok(None), UpdateStore::state)
    }

    pub(super) fn is_skipped(&self, v: Version) -> Result<bool, Error> {
        self.store_for_read()?
            .map_or(Ok(false), |s| s.is_skipped(&v.to_string()))
    }

    pub(super) fn remember_skip(&self, version: &str) -> Result<(), Error> {
        self.store()?.remember_skip(version)
    }

    /// The work behind [`Updater::new`].
    pub fn new(
        cfg: UpdateConfig,
        binary: PathBuf,
        state_dir: PathBuf,
        running: Version,
        notify: EventSink,
        state_copy: Option<StateCopy>,
    ) -> Result<Self, Error> {
        let effective = effective_mode(cfg.mode, &container_evidence());
        if !cfg.url.is_empty() && !cfg.url.starts_with("https://") && !cfg.allow_insecure {
            return Err(Error::config(
                format!(
                    "update_url `{}` is not https:// and update_allow_insecure is off",
                    cfg.url
                ),
                "a plain-http release host lets anyone on the path swap VERSION; use https, or set update_allow_insecure=true for a drill server you control",
            ));
        }
        if cfg.pubkey_overridden {
            tracing::warn!(
                "self-update trusts a key from update_pubkey instead of the compiled-in ecosystem key"
            );
        }
        let http = reqwest::Client::builder()
            .timeout(cfg.download_timeout)
            .build()
            .map_err(|e| Error::internal(format!("http client: {e}"), "report this"))?;
        Ok(Self {
            cfg,
            effective,
            http,
            binary,
            state_dir,
            running,
            notify,
            state_copy,
            last: Arc::new(Mutex::new(LastCheck::default())),
            store: OnceLock::new(),
        })
    }

    /// Where the update state lived before the kit database (3.x up to
    /// 4.4): the file the one-time import reads.
    #[deprecated(
        since = "4.5.0",
        note = "the update state lives in the kit database; use Updater::pending_state"
    )]
    pub fn state_path(&self) -> PathBuf {
        self.state_dir.join("update-state.json")
    }

    /// Where the rolled-back versions lived before the kit database.
    #[deprecated(
        since = "4.5.0",
        note = "the skip list lives in the kit database; it is only imported once"
    )]
    pub fn skip_path(&self) -> PathBuf {
        self.state_dir.join("update-skip.json")
    }
}
