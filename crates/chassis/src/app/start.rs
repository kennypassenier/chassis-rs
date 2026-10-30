//! `App::start`: install logging, open the stores, wire the kit's metrics
//! and guards, mount the routes, bind, serve and announce readiness. The
//! stages live in child modules so this file reads as the sequence.

use std::sync::Arc;

use tokio::sync::Semaphore;

use super::{App, Running};
use crate::core::error::Error;
use crate::shell::config_load::Loaded;
use crate::shell::guards::Guards;
use crate::shell::health::Health;
use crate::shell::http::AccessState;
use crate::shell::lifecycle;
use crate::shell::logging::{self, LogFormat};
use crate::shell::metrics::Metrics;

#[cfg(feature = "dashboard")]
mod dashboard_mount;
mod mount;
mod serve;
mod stores;

impl App {
    /// Install logging and metrics, bind, announce readiness, serve.
    #[cfg_attr(not(feature = "notify"), allow(unused_mut))]
    pub(super) async fn start_server(mut self) -> Result<Running, Error> {
        let loaded = self.loaded.clone().ok_or_else(|| {
            Error::internal(
                "start() called on a control-command app",
                "call run() instead",
            )
        })?;
        self.init_runtime(&loaded)?;
        let mut stores = self.open_stores(&loaded)?;
        #[cfg(feature = "self-update")]
        self.wire_updater()?;
        let (metrics, health) = self.install_telemetry()?;
        let guards = self.build_guards();
        let access = AccessState {
            requests_total: metrics.requests_total(),
        };
        let (listener, addr) = self.bind().await?;

        let mounted = self
            .mount_routes(&loaded, &guards, &health, addr, &mut stores, metrics)
            .await?;
        let router = self.layer_router(mounted.router, guards, access, mounted.html_errors)?;
        let (stop_tx, task) = serve::spawn_server(listener, router);
        lifecycle::notify_ready();
        #[cfg(feature = "notify")]
        self.announce_started(addr, &health);
        #[cfg(unix)]
        let backup = self.start_backup_server(&loaded);
        for hook in self.start_hooks.drain(..) {
            hook();
        }
        Ok(Running {
            addr,
            stop: stop_tx,
            task,
            shutdown_timeout: self.shutdown_timeout,
            flushes: mounted.flushes,
            #[cfg(unix)]
            backup,
            #[cfg(feature = "storage")]
            storage_tasks: stores.storage.spawn(),
        })
    }

    /// Logging, the state directory and the startup warnings: the first
    /// things a start does, before any store opens.
    fn init_runtime(&self, loaded: &Loaded) -> Result<(), Error> {
        let filter = loaded.get("log").unwrap_or("info").to_string();
        let format = LogFormat::parse(loaded.get("log_format").unwrap_or("text"))?;
        logging::init(&filter, format)?;
        // H11: the state root is created and proven writable before anything
        // else, so a wrong ReadWritePaths or bind-mount owner fails here
        // with the chown remedy instead of as a 503 at the first login.
        crate::shell::store::probe_state_dir(&loaded.state_dir, true)?;
        for warning in self.startup_warnings() {
            tracing::warn!("{warning}");
        }
        Ok(())
    }

    /// Register the pause metric, then install the metrics registry and the
    /// health aggregator over everything registered so far.
    fn install_telemetry(&mut self) -> Result<(Metrics, Health), Error> {
        // feat-backup-1: whether a backup pause holds the state, and since when.
        self.scrape_sources
            .push(Arc::new(crate::shell::backup::PauseMetrics(
                self.spec.metric_prefix(),
            )));
        let metrics = Metrics::install(
            &self.spec.metric_prefix(),
            self.spec.version,
            self.scrape_sources.clone(),
        )?;
        let health = Health::new(
            self.spec.version,
            self.limits.subsystem_check_timeout,
            self.subsystems.clone(),
        );
        Ok((metrics, health))
    }

    /// The shared state of the kit's request guards, from the limits.
    fn build_guards(&self) -> Guards {
        Guards {
            max_in_flight: Arc::new(Semaphore::new(self.limits.max_in_flight)),
            retry_after: self.limits.retry_after,
            request_timeout: self.limits.request_timeout,
            timeout_exempt: Arc::new(self.timeout_exempt.clone()),
            trusted_proxies: Arc::new(self.limits.trusted_proxies.clone()),
            kit_problems: Arc::new(std::sync::Mutex::new(Vec::new())),
            untrusted_proxy_warned: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }
}
