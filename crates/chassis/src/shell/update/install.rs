//! Installing a verified release and the startup side of an update: the
//! download-verify-stage-swap pipeline, the probation and revert decision at
//! the next start, the drill marker and the health confirmation. Its own
//! module because this is the part that changes files on disk.

use super::*;

impl Updater {
    /// Download the binary and prove it against the signed manifest: the
    /// signature is checked before any hash is read, and the binary's
    /// SHA-256 must match the manifest's line for the asset.
    async fn download_verified(&self, version: Version) -> Result<Vec<u8>, Error> {
        let manifest = self.get("SHA256SUMS").await?;
        let signature = String::from_utf8(self.get("SHA256SUMS.minisig").await?).map_err(|_| {
            Error::dependency(
                "SHA256SUMS.minisig is not text",
                "the release host is serving something else",
            )
        })?;
        self.verify_manifest(&manifest, &signature, version)?;
        let manifest_text = String::from_utf8_lossy(&manifest).into_owned();
        let expected = hash_for(&manifest_text, &self.cfg.asset_name)?;

        let binary = self.get(&self.cfg.asset_name).await?;
        let actual = sha256_hex(&binary);
        if !hash_matches(&expected, &actual) {
            return Err(Error::config(
                format!(
                    "the downloaded binary's SHA-256 ({actual}) does not match the signed manifest ({expected})"
                ),
                "nothing was installed; the release host is serving a different file than it signed",
            ));
        }
        Ok(binary)
    }

    /// Let the project copy its state aside (K21) before the binary swaps,
    /// then prune old copies.
    fn copy_state_aside(&self, version: Version) -> Result<(), Error> {
        let Some(copy) = &self.state_copy else {
            return Ok(());
        };
        let dest = self.cfg.copies_dir.join(version.to_string());
        std::fs::create_dir_all(&dest).map_err(|e| {
            Error::config(
                format!(
                    "cannot create the pre-update copy dir {}: {e}",
                    dest.display()
                ),
                "make update_copies_dir writable for the service user, or point it elsewhere",
            )
        })?;
        copy(&dest)?;
        prune_copies(&self.cfg.copies_dir, self.cfg.keep_copies);
        Ok(())
    }

    /// Write the drill marker when a drill is configured: the installed
    /// version will fail on purpose.
    fn arm_drill(&self, version: Version) -> Result<(), Error> {
        let Some(kind) = &self.cfg.drill else {
            return Ok(());
        };
        let marker = DrillMarker {
            version: version.to_string(),
            kind: kind.clone(),
        };
        let bytes = serde_json::to_vec(&marker).expect("marker serialises");
        write_atomic(&self.drill_path(), &bytes, "drill marker")?;
        tracing::warn!(kind = %kind, %version, "DRILL: the installed version will fail on purpose");
        Ok(())
    }

    pub(super) async fn install(&self, version: Version) -> Result<(), Error> {
        let binary = self.download_verified(version).await?;

        let staging = self.staging_path();
        write_executable(&staging, &binary)?;
        if let Err(e) = probe(&staging, self.cfg.probe_timeout).await {
            let _ = std::fs::remove_file(&staging);
            return Err(e);
        }

        self.copy_state_aside(version)?;

        // Critic #1, now in `install_binary`: hard-link the old binary
        // aside, then one rename. `bin` exists at every instant.
        let prev = self.prev_path();
        install_staged(&staging, &self.binary)?;

        self.arm_drill(version)?;

        if self.effective.mode == Mode::Autonomous {
            let state = UpdateState {
                from_version: self.running.to_string(),
                to_version: version.to_string(),
                previous_binary: prev.display().to_string(),
                attempts: 0,
            };
            write_state(&self.state_path(), &state)?;
        }
        (self.notify)(Event {
            kind: "update.installed",
            version: version.to_string(),
            detail: format!(
                "{} → {} ({})",
                self.running,
                version,
                self.effective.mode.label()
            ),
        });
        tracing::info!(from = %self.running, to = %version, mode = self.effective.mode.label(), "update installed");
        Ok(())
    }

    /// Put `bin.prev` back after a version that never became healthy,
    /// remember the version so it is not retried, and say what happened.
    /// Returns whether the process should exit for the supervisor.
    fn revert(&self, s: &UpdateState) -> bool {
        let prev = PathBuf::from(&s.previous_binary);
        let restored = restore_from(&prev, &self.binary);
        clear_state(&self.state_path());
        if let Err(e) = self.remember_skip(&s.to_version) {
            tracing::error!(error = %e, version = %s.to_version, "cannot record the rolled-back version; it may be retried next interval");
        }
        match restored {
            Ok(()) => {
                tracing::error!(failed = %s.to_version, restored = %s.from_version, "update reverted: the new version never became healthy");
                (self.notify)(Event {
                    kind: "update.rolled_back",
                    version: s.to_version.clone(),
                    detail: format!(
                        "{} did not come up; reverted to {}",
                        s.to_version, s.from_version
                    ),
                });
                true
            }
            Err(e) => {
                tracing::error!(error = %e, "revert wanted but the previous binary is gone; running on");
                (self.notify)(Event {
                    kind: "update.failed",
                    version: s.to_version.clone(),
                    detail: format!("revert impossible: {e}"),
                });
                false
            }
        }
    }

    /// At startup, before the stores open (AR15): count the attempt and
    /// revert if the previous start never became healthy. Returns whether
    /// the process should exit (after a revert) so the supervisor starts
    /// the restored binary.
    pub fn handle_pending_update(&self) -> Result<bool, Error> {
        let state = read_state(&self.state_path());
        match decide_at_startup(
            state,
            &self.running.to_string(),
            self.cfg.max_start_attempts,
        ) {
            StartAction::Normal => Ok(false),
            StartAction::Stale(s) => {
                tracing::warn!(pending = %s.to_version, running = %self.running, "update state names another version; clearing it");
                clear_state(&self.state_path());
                Ok(false)
            }
            StartAction::Probation(s) => {
                tracing::info!(to = %s.to_version, attempt = s.attempts, "new version on probation");
                write_state(&self.state_path(), &s)?;
                Ok(false)
            }
            StartAction::Revert(s) => Ok(self.revert(&s)),
        }
    }

    /// The drill (K20, critic #6): only the version the marker names
    /// breaks, and the marker is consumed so the restored version runs.
    pub fn drill_kind(&self) -> Option<String> {
        let path = self.drill_path();
        let marker: Option<DrillMarker> = std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok());
        let kind = drill_applies(marker.as_ref(), &self.running.to_string()).map(|k| k.to_string());
        if kind.is_some() {
            let _ = std::fs::remove_file(&path);
        }
        kind
    }

    /// Called once the service is bound and has served for `healthy_after`
    /// (liveness only, critic #3): the probation is over.
    pub fn confirm_healthy(&self) {
        if read_state(&self.state_path()).is_some() {
            clear_state(&self.state_path());
            tracing::info!(version = %self.running, "update confirmed healthy");
            (self.notify)(Event {
                kind: "update.ok",
                version: self.running.to_string(),
                detail: "new version served past the healthy-after window".to_string(),
            });
        }
    }
}
