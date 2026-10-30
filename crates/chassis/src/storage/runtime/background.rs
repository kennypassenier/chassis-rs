//! The monitor's background tasks: the ten-minute budget check and the
//! daily removal of rows finished by their own definition. Its own module
//! because it is the only code of the monitor that runs on a timer.

use std::time::Duration;

use super::{CHECK_EVERY, PRUNE_EVERY, Storage};

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
}
