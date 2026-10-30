//! Self-update wiring on `App` at start: report the update mode and trust
//! root, start the read-only release watch and feed the status card, and
//! the project's hooks (gate, event listener, state copy). The `Updater`
//! itself is built in `build`.

use std::sync::Arc;

use super::App;
use crate::core::error::Error;
#[cfg(feature = "dashboard")]
use crate::shell::update::Updater;

mod build;

impl App {
    /// Rule 23 / rule 12: say the mode decision out loud once, start the
    /// read-only release watch when the updater is not autonomous and, with
    /// a dashboard, feed the status card.
    pub(super) fn wire_updater(&mut self) -> Result<(), Error> {
        // Rule 23 / rule 12: the mode decision is said out loud once,
        // with its reason and the trust root in force.
        let updater = self.build_updater(false)?;
        let trust_root = if updater.cfg.pubkey_overridden {
            "update_pubkey (OVERRIDDEN)"
        } else {
            "compiled-in ecosystem key"
        };
        tracing::info!(
            configured = %self.limits.update.mode,
            effective = updater.effective.mode.label(),
            reason = updater.effective.reason,
            trust_root,
            url = %updater.cfg.url,
            "self-update"
        );
        // K20: off and supervised still learn about newer releases,
        // read-only, so the status card is never decoration.
        if updater.effective.mode != crate::core::update::Mode::Autonomous
            && !updater.cfg.url.is_empty()
        {
            tokio::spawn(updater.clone().run_watch());
        }
        #[cfg(feature = "dashboard")]
        self.register_update_view(&updater);
        Ok(())
    }

    /// The status card's update line and "Check for updates" button, unless
    /// the project registered its own view.
    #[cfg(feature = "dashboard")]
    fn register_update_view(&mut self, updater: &Arc<Updater>) {
        if self.dash.update.is_none() {
            let updater = updater.clone();
            let mode = updater.effective.mode.label().to_string();
            let reason = updater.effective.reason.to_string();
            let overridden = updater.cfg.pubkey_overridden;
            let no_url = updater.cfg.url.is_empty();
            if !no_url {
                let checker = updater.clone();
                self.dash.check_update = Some(Arc::new(move || {
                    let checker = checker.clone();
                    Box::pin(async move { checker.watch_once().await.map(|_| ()) })
                }));
            }
            self.dash.update = Some(Arc::new(move || {
                let last = updater.last_check();
                let mut note = last
                    .error
                    .or_else(|| last.outcome.clone())
                    .unwrap_or_else(|| reason.clone());
                if no_url {
                    note = format!(
                        "{note}; no release host configured (update_url / AppSpec.repository), so no version check"
                    );
                }
                if overridden {
                    note = format!("{note}; TRUST ROOT OVERRIDDEN by update_pubkey");
                }
                crate::shell::dashboard::UpdateView {
                    mode: mode.clone(),
                    latest: last.latest.unwrap_or_else(|| "not checked yet".to_string()),
                    last_check: last.at.unwrap_or_else(|| "never".to_string()),
                    note: Some(note),
                }
            }));
        }
    }

    /// Say "not now" to the autonomous update loop (1.2.0). The closure
    /// runs before every check; `Some(reason)` defers that check to the
    /// next interval and logs the reason. For a service that must not
    /// restart while an investigation is in progress (Almanac's captures,
    /// a long-running import). Supervised updates (`<name> update`) are
    /// the operator's decision and are not gated.
    #[cfg(feature = "self-update")]
    pub fn update_gate(
        &mut self,
        f: impl Fn() -> Option<String> + Send + Sync + 'static,
    ) -> &mut Self {
        self.update_gate = Some(Arc::new(f));
        self
    }

    /// Listen to the update events (1.3.0): `update.installed`, `update.ok`,
    /// `update.failed`, `update.rolled_back`, `update.held`, whichever loop
    /// or subcommand produced them. The kit still handles the event itself
    /// (the `notify` feature's webhooks, or a log line); the hook runs
    /// alongside, so a project can speak its own vocabulary to its own
    /// notifier — Almanac's `almanac-update` / `-reverted` / `-unverified`.
    #[cfg(feature = "self-update")]
    pub fn on_update_event(
        &mut self,
        f: impl Fn(&crate::shell::update::Event) + Send + Sync + 'static,
    ) -> &mut Self {
        self.update_hook = Some(Arc::new(f));
        self
    }

    /// How the project produces a consistent copy of its state into `dest`
    /// before a binary swap (K21; kyu's `VACUUM INTO`).
    #[cfg(feature = "self-update")]
    pub fn state_copy(
        &mut self,
        f: impl Fn(&std::path::Path) -> Result<(), Error> + Send + Sync + 'static,
    ) -> &mut Self {
        self.state_copy = Some(Arc::new(f));
        self
    }
}
