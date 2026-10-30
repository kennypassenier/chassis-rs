//! The last steps of `App::start`: bind the listener, serve it, announce
//! the start, and the sockets and watchers that run next to the server.

use std::net::SocketAddr;

use axum::Router;
use tokio::net::TcpListener;
use tokio::sync::oneshot;

use super::super::App;
use crate::core::error::Error;
use crate::shell::config_load::Loaded;

impl App {
    /// Bind the configured address and log it.
    pub(super) async fn bind(&self) -> Result<(TcpListener, SocketAddr), Error> {
        let listener = TcpListener::bind(self.listen).await.map_err(|e| {
            Error::config(
                format!("cannot listen on {}: {e}", self.listen),
                format!(
                    "free the port or set {}_LISTEN to another address",
                    self.spec.prefix()
                ),
            )
        })?;
        let addr = listener
            .local_addr()
            .map_err(|e| Error::internal(format!("local_addr: {e}"), "report this"))?;
        tracing::info!(name = self.spec.name, version = self.spec.version, %addr, "listening");
        Ok((listener, addr))
    }

    /// `service.started` and the `health.degraded` / `health.recovered`
    /// events, sampled on a timer.
    #[cfg(feature = "notify")]
    pub(super) fn announce_started(&self, addr: SocketAddr, health: &crate::shell::health::Health) {
        self.notifier.emit(
            "service.started",
            self.spec.version,
            format!("listening on {addr}"),
        );
        // health.degraded / health.recovered, once per transition (debounced by construction).
        let n = self.notifier.clone();
        let h = health.clone();
        let every = self.limits.notify.health_sample;
        let version = self.spec.version;
        tokio::spawn(async move {
            let mut degraded = false;
            loop {
                tokio::time::sleep(every).await;
                let report = h.report().await;
                let now_degraded = report.status != "ok";
                if now_degraded != degraded {
                    degraded = now_degraded;
                    let detail = serde_json::to_string(&report.subsystems).unwrap_or_default();
                    n.emit(
                        if degraded {
                            "health.degraded"
                        } else {
                            "health.recovered"
                        },
                        version,
                        detail,
                    );
                }
            }
        });
    }

    /// The backup socket, with the pause and resume hooks of the kit and of
    /// the project; `None` when the socket cannot be created.
    #[cfg(unix)]
    pub(super) fn start_backup_server(
        &mut self,
        loaded: &Loaded,
    ) -> Option<crate::shell::backup::server::Server> {
        crate::shell::backup::server::Server::start(
            crate::shell::backup::server_socket_path(self.spec.name),
            crate::shell::backup::Controller::new(
                {
                    // 3.11.0: the sqlite logs are settled first, by the kit,
                    // then the project's own hooks run.
                    #[allow(unused_mut)]
                    let mut hooks: Vec<crate::shell::backup::PauseHook> = Vec::new();
                    #[cfg(feature = "storage")]
                    if !self.dbs.is_empty() {
                        hooks.push(crate::storage::pause_hook(self.dbs.clone()));
                    }
                    hooks.extend(std::mem::take(&mut self.backup_pause_hooks));
                    hooks
                },
                std::mem::take(&mut self.backup_resume_hooks),
            )
            .with_mode(self.backup_mode)
            .with_paths({
                let mut paths = vec![loaded.state_dir.clone()];
                paths.extend(std::mem::take(&mut self.backup_paths));
                // A database outside the state root still stands still.
                #[cfg(feature = "storage")]
                for db in &self.dbs {
                    if let Some(dir) = db.path().and_then(|p| p.parent())
                        && !paths.iter().any(|p| dir.starts_with(p))
                    {
                        paths.push(dir.to_path_buf());
                    }
                }
                paths
            }),
        )
    }
}

/// Serve `router` on `listener` until the returned sender fires; the task
/// finishes when in-flight requests drained.
pub(super) fn spawn_server(
    listener: TcpListener,
    router: Router,
) -> (oneshot::Sender<()>, tokio::task::JoinHandle<()>) {
    let (stop_tx, stop_rx) = oneshot::channel::<()>();
    let task = tokio::spawn(async move {
        let serve = axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async {
            let _ = stop_rx.await;
        });
        if let Err(e) = serve.await {
            tracing::error!(error = %e, "server stopped with an error");
        }
    });
    (stop_tx, task)
}
