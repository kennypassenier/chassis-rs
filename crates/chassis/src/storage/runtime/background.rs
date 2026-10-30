//! The monitor's background tasks: the ten-minute budget check and the
//! daily removal of rows finished by their own definition. Its own module
//! because it is the only code of the monitor that runs on a timer; the
//! public `prune_finished` the daily task calls sits beside it.

use std::time::Duration;

use super::{CHECK_EVERY, PRUNE_EVERY, Storage};
use crate::core::error::Error;

impl Storage {
    /// The background work: the ten-minute budget check and the daily
    /// removal of rows finished by their own definition.
    pub(crate) fn spawn(&self) -> Vec<tokio::task::JoinHandle<()>> {
        let mut tasks = Vec::new();
        let me = self.clone();
        tasks.push(tokio::spawn(async move {
            let mut tick = tokio::time::interval(CHECK_EVERY);
            tick.tick().await;
            loop {
                tick.tick().await;
                let again = me.clone();
                if let Ok(Err(e)) = tokio::task::spawn_blocking(move || {
                    again.settle_logs();
                    again.check()
                })
                .await
                {
                    tracing::warn!(error = %e, "storage: the budget check failed");
                }
            }
        }));
        let me = self.clone();
        tasks.push(tokio::spawn(async move {
            // A minute after start, then daily.
            tokio::time::sleep(Duration::from_secs(60)).await;
            let mut tick = tokio::time::interval(PRUNE_EVERY);
            loop {
                tick.tick().await;
                let again = me.clone();
                match tokio::task::spawn_blocking(move || again.prune_finished()).await {
                    Ok(Err(e)) => {
                        tracing::warn!(error = %e, "storage: pruning finished rows failed")
                    }
                    Ok(Ok(())) => {
                        let again = me.clone();
                        let _ = tokio::task::spawn_blocking(move || again.check()).await;
                    }
                    Err(_) => {}
                }
            }
        }));
        tasks
    }

    /// Remove, on the app's side, the rows of declared kinds that are
    /// finished by their own definition, and, on the kit's side, the
    /// sessions that expired. Nothing else is ever removed on its own.
    pub fn prune_finished(&self) -> Result<(), Error> {
        if let Some(app) = &self.inner.app {
            app.prune_finished()?;
        }
        let kit_prune = self.inner.kit_prune.lock().expect("prune lock").clone();
        if let Some(f) = kit_prune {
            let removed = f()?;
            tracing::info!(
                removed,
                "storage: removed expired sessions from the kit database"
            );
        }
        Ok(())
    }
}
