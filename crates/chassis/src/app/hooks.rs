//! Lifecycle hooks and runtime registrations: check, flush and start hooks,
//! subsystems, metrics sources, request guards and timeout exemptions.

use super::App;
use crate::core::error::Error;
use crate::shell::health::Subsystem;
use crate::shell::metrics::ScrapeSource;
use std::sync::Arc;

impl App {
    /// A project check that `--check` (and the self-update's staged probe)
    /// runs after the kit's own validation. It must not write: the probe
    /// runs against the live store while the old version still serves.
    /// That includes opening the store: open it read-only here, never through
    /// the path that migrates. kyu 3.3.0 opened it the migrating way, and the
    /// probe, run as root on CT 109, applied a migration and left a
    /// root-owned `kyu.pre-v4.db` behind (kyu fix-check-1, 2026-09-20).
    pub fn on_check(
        &mut self,
        f: impl FnOnce() -> Result<(), Error> + Send + 'static,
    ) -> &mut Self {
        self.checks.push(Box::new(f));
        self
    }

    /// Something to run after the server drained and before exit (K5):
    /// checkpoint a database, flush a journal.
    pub fn on_flush(&mut self, f: impl FnOnce() + Send + 'static) -> &mut Self {
        self.flush = Some(Box::new(f));
        self
    }

    pub fn on_start(&mut self, f: impl FnOnce() + Send + 'static) -> &mut Self {
        self.start_hooks.push(Box::new(f));
        self
    }

    /// A part of the service whose health shows in `/healthz` (K6).
    pub fn subsystem(&mut self, s: impl Subsystem + 'static) -> &mut Self {
        self.subsystems.push(Arc::new(s));
        self
    }

    /// Prometheus text the project computes at scrape time, appended to
    /// `/metrics` verbatim (K7; how kyu keeps its dynamic label sets).
    pub fn metrics_source(&mut self, s: impl ScrapeSource + 'static) -> &mut Self {
        self.scrape_sources.push(Arc::new(s));
        self
    }

    /// feat-guard-1: run `guard` before every route the service serves, the
    /// kit's own included (`/login`, `/static`, `/api`, the web app), after
    /// the proxy handling and before any login. `Ok(())` lets the request
    /// through; `Err(response)` is sent as it is. Guards run in registration
    /// order and the first refusal wins. `/healthz` is always exempt; see
    /// [`App::request_guard_exempt`] for more. A header a proxy sets
    /// (`Cf-Connecting-IP`, `Cf-Access-Jwt-Assertion`) is only worth reading
    /// when [`GuardRequest::from_trusted_proxy`] is true.
    ///
    /// [`GuardRequest::from_trusted_proxy`]: crate::shell::request_guard::GuardRequest::from_trusted_proxy
    #[cfg(feature = "request-guard")]
    pub fn request_guard<F, Fut>(&mut self, guard: F) -> &mut Self
    where
        F: Fn(crate::shell::request_guard::GuardRequest) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<(), axum::response::Response>> + Send + 'static,
    {
        let guard = Arc::new(guard);
        self.request_guards.push(Arc::new(move |r| {
            let guard = guard.clone();
            Box::pin(async move { guard(r).await })
        }));
        self
    }

    /// feat-guard-1: paths under this prefix skip the request guards (a
    /// whole segment: `/metrics` covers `/metrics` and `/metrics/x`, not
    /// `/metricsx`). `/healthz` is exempt without asking.
    #[cfg(feature = "request-guard")]
    pub fn request_guard_exempt(&mut self, path_prefix: impl Into<String>) -> &mut Self {
        self.request_guard_exempt.push(path_prefix.into());
        self
    }

    /// Let the pages use a browser feature the kit's `Permissions-Policy`
    /// turns off by default (`camera`, `microphone`, `geolocation`,
    /// `accelerometer`, `gyroscope`, `magnetometer`, `display-capture`,
    /// `midi`, `payment`, `usb`): it is sent as `feature=(self)`. A name
    /// that is not lowercase letters and `-` is refused at start.
    pub fn allow_browser_feature(&mut self, feature: impl Into<String>) -> &mut Self {
        self.browser_features.push(feature.into());
        self
    }

    /// Raise the request-body cap for the paths under this prefix (a whole
    /// segment: `/data/import` covers `/data/import/x`, not `/data/imports`)
    /// to `max_bytes`, for a restore or import route whose body is bigger
    /// than `max_body_bytes` (default 1 MiB, which stays the cap everywhere
    /// else). The longest matching prefix wins; a bad prefix (not starting
    /// with `/`) or a cap of 0 is refused at start. The raised cap is the
    /// route's own, not a floor: lowering below the default works too.
    ///
    /// axum's `DefaultBodyLimit` cannot do this: the kit's cap wraps the body
    /// before any route sees it, so a per-route layer can only lower it.
    ///
    /// ```ignore
    /// app.body_limit("/data/import", 64 * 1024 * 1024);
    /// ```
    pub fn body_limit(&mut self, path_prefix: impl Into<String>, max_bytes: usize) -> &mut Self {
        self.body_limits.push((path_prefix.into(), max_bytes));
        self
    }

    /// Paths under this prefix are not subject to the request timeout
    /// (long polls, streaming).
    pub fn exempt_from_timeout(&mut self, path_prefix: impl Into<String>) -> &mut Self {
        self.timeout_exempt.insert(path_prefix.into());
        self
    }

    /// The URL `--healthcheck` probes when none is given: the configured
    /// port on the loopback address (an unspecified bind cannot be dialled).
    pub fn healthcheck_url(&self) -> String {
        let host = if self.listen.ip().is_unspecified() {
            "127.0.0.1".to_string()
        } else {
            self.listen.ip().to_string()
        };
        format!("http://{}:{}/healthz", host, self.listen.port())
    }
}
