//! Stopping a started service: drain in-flight requests, end the backup pause,
//! run the flush hooks.

use super::Running;
use crate::shell::lifecycle;

impl Running {
    /// Drain in-flight requests and run the flush hooks (the kit's, then
    /// the project's), each bounded by the shutdown timeout. Always
    /// returns; the caller exits 0 (N1).
    pub async fn stop(self) {
        let Running {
            stop,
            task,
            shutdown_timeout,
            flushes,
            #[cfg(unix)]
            backup,
            #[cfg(feature = "storage")]
            storage_tasks,
            ..
        } = self;
        #[cfg(feature = "storage")]
        for t in &storage_tasks {
            t.abort();
        }
        // A held write would outlast the drain; end any backup pause first.
        #[cfg(unix)]
        if let Some(backup) = backup {
            backup.stop().await;
        }
        let _ = stop.send(());
        let drained = lifecycle::bounded(shutdown_timeout, "in-flight requests", async {
            let _ = task.await;
        })
        .await;
        for f in flushes {
            let done = tokio::task::spawn_blocking(f);
            lifecycle::bounded(shutdown_timeout, "a flush hook", async {
                let _ = done.await;
            })
            .await;
        }
        tracing::info!(drained, "stopped");
    }
}
