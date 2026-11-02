//! Building the `Updater` from the update knobs (K18), and the cross-checks
//! of those knobs at parse time. Its own module because it is the one place
//! the knobs, the notifier and the sqlite files meet the updater.

use std::path::PathBuf;
use std::sync::Arc;

use crate::core::error::Error;
use crate::core::update::{Hold, Mode, Version};
use crate::shell::config_load::Loaded;
use crate::shell::update::{
    Event, EventSink, RELEASE_PUBKEY, StateCopy, UpdateConfig, Updater, compose_sink,
};

use super::super::{App, AppSpec, Limits, UpdateKnobs};

impl App {
    /// Build the updater from the knobs (K18). `force_supervised` is what
    /// the `update` subcommand does regardless of the configured mode.
    pub(in super::super) fn build_updater(
        &self,
        force_supervised: bool,
    ) -> Result<Arc<Updater>, Error> {
        let loaded = self.loaded.as_ref().expect("loaded");
        let k = &self.limits.update;
        let mode = if force_supervised {
            Mode::Supervised
        } else {
            Mode::parse(&k.mode)?
        };
        let url = self.release_url();
        let binary = std::env::current_exe().map_err(|e| {
            Error::internal(format!("cannot find my own binary: {e}"), "report this")
        })?;
        let copies_dir = pre_update_copies_dir(k, loaded);
        let sink = compose_sink(self.update_event_sink(), self.update_hook.clone());
        let state_copy = self.pre_update_state_copy(loaded);
        let updater = Updater::new(
            self.update_config(mode, url, copies_dir)?,
            binary,
            loaded.state_dir.clone(),
            Version::parse(self.spec.version)?,
            sink,
            state_copy,
        )?;
        Ok(Arc::new(updater))
    }

    /// Where releases live: `update_url`, else the GitHub release download
    /// of `AppSpec.repository`, else nowhere (the watch then stays off).
    fn release_url(&self) -> String {
        match (&self.limits.update.url, self.spec.repository) {
            (Some(u), _) => u.clone(),
            (None, Some(repo)) => format!("https://github.com/{repo}/releases/latest/download"),
            (None, None) => String::new(),
        }
    }

    /// Where update events go: the notifier when the `notify` feature is
    /// on, else a log line.
    #[cfg(feature = "notify")]
    fn update_event_sink(&self) -> EventSink {
        let n = self.notifier.clone();
        Arc::new(move |e: Event| n.emit(e.kind, &e.version, e.detail))
    }

    /// Where update events go: the notifier when the `notify` feature is
    /// on, else a log line.
    #[cfg(not(feature = "notify"))]
    fn update_event_sink(&self) -> EventSink {
        Arc::new(
            |e: Event| tracing::info!(event = e.kind, version = %e.version, detail_len = e.detail.len(), "event"),
        )
    }

    /// 3.11.0: the sqlite files are snapshotted into the pre-update copy
    /// with VACUUM INTO after the project's own copy ran, replacing any
    /// raw copy of a live file it made.
    #[cfg(feature = "storage")]
    fn pre_update_state_copy(&self, loaded: &Loaded) -> Option<StateCopy> {
        let mut paths: Vec<PathBuf> = self
            .dbs
            .iter()
            .filter_map(|d| d.path().map(std::path::Path::to_path_buf))
            .collect();
        for file in [
            format!("{}.db", self.spec.name),
            format!("{}-kit.db", self.spec.name),
        ] {
            let p = loaded.state_dir.join(file);
            if !paths.contains(&p) {
                paths.push(p);
            }
        }
        let user = self.state_copy.clone();
        // No copy directory is made for a service with neither a hook
        // nor a database file, as before 3.11.0.
        (user.is_some() || paths.iter().any(|p| p.exists())).then(|| {
            Arc::new(move |dest: &std::path::Path| {
                if let Some(user) = &user {
                    user(dest)?;
                }
                crate::storage::copy_db_files(&paths, dest)
            }) as StateCopy
        })
    }

    /// Without the storage layer the project's own copy is all there is.
    #[cfg(not(feature = "storage"))]
    fn pre_update_state_copy(&self, _loaded: &Loaded) -> Option<StateCopy> {
        self.state_copy.clone()
    }

    /// The updater's settings from the parsed knobs.
    fn update_config(
        &self,
        mode: Mode,
        url: String,
        copies_dir: PathBuf,
    ) -> Result<UpdateConfig, Error> {
        let k = &self.limits.update;
        Ok(UpdateConfig {
            mode,
            url,
            asset_name: k
                .asset
                .clone()
                .unwrap_or_else(|| self.spec.name.to_string()),
            interval: k.interval,
            startup_delay: k.startup_delay,
            healthy_after: k.healthy_after,
            max_start_attempts: k.max_start_attempts,
            hold: Hold::parse(&k.hold)?,
            drill: if k.drill.is_empty() {
                None
            } else {
                Some(k.drill.clone())
            },
            keep_copies: k.keep_copies,
            probe_timeout: k.probe_timeout,
            download_timeout: k.download_timeout,
            pubkey: k
                .pubkey
                .clone()
                .unwrap_or_else(|| RELEASE_PUBKEY.to_string()),
            pubkey_overridden: k.pubkey.is_some(),
            repo: self.spec.repository.map(|r| r.to_string()),
            allow_insecure: k.allow_insecure,
            max_download_bytes: k.max_download_bytes,
            notify_after_failures: k.notify_after_failures,
            copies_dir,
            gate: self.update_gate.clone(),
        })
    }
}

/// The directory the pre-update copy goes to: `update_copies_dir`, else
/// `<state dir>-pre-update` next to the state directory.
fn pre_update_copies_dir(k: &UpdateKnobs, loaded: &Loaded) -> PathBuf {
    k.copies_dir.clone().unwrap_or_else(|| {
        let mut p = loaded.state_dir.clone();
        let name = p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        p.set_file_name(format!("{name}-pre-update"));
        p
    })
}

impl Limits {
    /// The update knobs are validated at parse time so `--check` refuses
    /// them: mode, hold, drill, the trust-root override and a release host.
    pub(in super::super) fn validate_update(&self, spec: &AppSpec) -> Result<(), Error> {
        crate::core::update::Mode::parse(&self.update.mode)?;
        crate::core::update::Hold::parse(&self.update.hold)?;
        if !matches!(
            self.update.drill.as_str(),
            "" | "broken" | "broken-after-ready"
        ) {
            return Err(Error::config(
                format!(
                    "update_drill `{}` is not one of broken, broken-after-ready",
                    self.update.drill
                ),
                "leave it empty unless you are running the broken-release drill",
            ));
        }
        if let Some(key) = &self.update.pubkey {
            minisign_verify::PublicKey::from_base64(key).map_err(|e| {
                Error::config(
                    format!("update_pubkey is not a minisign public key: {e}"),
                    "paste the base64 line of the drill key's minisign.pub, or unset it to trust the ecosystem key",
                )
            })?;
        }
        if self.update.mode != "off" && self.update.url.is_none() && spec.repository.is_none() {
            return Err(Error::config(
                "update_mode is on but neither update_url nor AppSpec.repository says where releases live",
                "set update_url to the directory holding VERSION, SHA256SUMS, SHA256SUMS.minisig and the binary, or set AppSpec.repository",
            ));
        }
        Ok(())
    }
}
