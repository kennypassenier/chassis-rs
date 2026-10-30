//! Construction of the [`Updater`] and the files it keeps next to the binary
//! and in the state directory (`.prev`, `.staging`, `.drill`, the skip list).
//! Its own module so the path layout sits in one place, away from the
//! network and install logic.

use super::*;

impl Updater {
    /// The work behind [`Updater::new`].
    pub(super) fn build(
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
        })
    }

    pub(super) fn prev_path(&self) -> PathBuf {
        with_suffix(&self.binary, ".prev")
    }

    pub(super) fn staging_path(&self) -> PathBuf {
        with_suffix(&self.binary, ".staging")
    }

    pub(super) fn drill_path(&self) -> PathBuf {
        with_suffix(&self.binary, ".drill")
    }

    pub(super) fn skipped_versions(&self) -> Vec<String> {
        std::fs::read(self.skip_path())
            .ok()
            .and_then(|b| serde_json::from_slice::<Vec<String>>(&b).ok())
            .unwrap_or_default()
    }

    pub(super) fn is_skipped(&self, v: Version) -> bool {
        self.skipped_versions().contains(&v.to_string())
    }

    pub(super) fn remember_skip(&self, version: &str) -> Result<(), Error> {
        let mut v = self.skipped_versions();
        if !v.iter().any(|s| s == version) {
            v.push(version.to_string());
        }
        let bytes = serde_json::to_vec_pretty(&v).expect("skip list serialises");
        write_atomic(&self.skip_path(), &bytes, "update skip list")
    }
}
