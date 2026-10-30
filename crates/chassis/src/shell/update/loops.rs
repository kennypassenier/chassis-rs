//! The two background loops: the read-only watcher for `off` and
//! `supervised`, and the autonomous check-and-install loop. Its own module
//! so scheduling stays apart from what one check does.

use super::*;

impl Updater {
    /// The work behind [`Updater::run_watch`].
    pub(super) async fn watch_loop(self: Arc<Self>) {
        tokio::time::sleep(self.cfg.startup_delay).await;
        loop {
            match self.watch_once().await {
                Ok(latest) => {
                    tracing::info!(%latest, running = %self.running, "release check (read-only)")
                }
                Err(e) => {
                    tracing::warn!(error = %e, "release check failed; retrying next interval")
                }
            }
            tokio::time::sleep(self.cfg.interval).await;
        }
    }

    /// The work behind [`Updater::run_autonomous`].
    pub(super) async fn autonomous_loop(self: Arc<Self>) {
        tokio::time::sleep(self.cfg.startup_delay).await;
        loop {
            if let Some(reason) = self.cfg.gate.as_ref().and_then(|gate| gate()) {
                tracing::info!(%reason, "update check deferred to the next interval");
                tokio::time::sleep(self.cfg.interval).await;
                continue;
            }
            match self.check_once().await {
                Ok(Outcome::Installed { from, to }) => {
                    tracing::info!(%from, %to, "update installed; exiting 0 so the supervisor restarts the new binary");
                    return;
                }
                Ok(o) => tracing::info!(outcome = ?o, "update check"),
                Err(e) => tracing::warn!(error = %e, "update check failed; retrying next interval"),
            }
            tokio::time::sleep(self.cfg.interval).await;
        }
    }
}
