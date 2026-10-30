//! `/metrics` (K7, AR12): Prometheus text, numbers only, open.
//!
//! Two sources are concatenated on every scrape. First the `metrics`
//! facade's registry, where the kit's own series live
//! (`<prefix>_build_info`, `<prefix>_uptime_seconds`,
//! `<prefix>_http_requests_total`) and where a project may record with
//! the `metrics::counter!`/`gauge!` macros under any name it likes.
//! Second, verbatim, whatever the project's registered scrape sources
//! return — that is how kyu keeps `kyu_deliveries{topic,subscription,
//! state}` computed at scrape time with a label set the facade could not
//! express (critic #9). Metric names are therefore a project's contract,
//! not the kit's.
//!
//! Blind spots, for the docs: `http_requests_total` counts requests the
//! kit's layers saw; a connection refused at the socket never reaches it.
//! `uptime_seconds` restarts at zero on every restart, so a low value
//! after an update is expected, not a fault.

mod exposition;
mod instruments;

use exposition::{Series, labels_of};
use std::sync::Arc;
use std::time::Instant;

use axum::extract::State;
use axum::http::header;
use axum::response::{IntoResponse, Response};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};

use crate::core::error::Error;

/// A project-owned scrape source: returns Prometheus exposition text,
/// appended verbatim after the kit's registry.
pub trait ScrapeSource: Send + Sync {
    fn scrape(&self) -> String;
}

/// Router state for the `/metrics` route.
#[derive(Clone)]
pub struct Metrics {
    prefix: String,
    handle: PrometheusHandle,
    started: Instant,
    sources: Arc<Vec<Arc<dyn ScrapeSource>>>,
}

impl Metrics {
    /// Install the process-global recorder once. A second install in one
    /// process (tests build several apps) reuses the first handle: the
    /// facade records into one recorder per process whatever we do.
    pub fn install(
        prefix: &str,
        version: &str,
        sources: Vec<Arc<dyn ScrapeSource>>,
    ) -> Result<Self, Error> {
        // `get_or_init` serialises the first install, so parallel tests
        // (or a project that builds two Apps) cannot race two recorders.
        static HANDLE: std::sync::OnceLock<Result<PrometheusHandle, String>> =
            std::sync::OnceLock::new();
        let handle = HANDLE
            .get_or_init(|| {
                PrometheusBuilder::new()
                    .install_recorder()
                    .map_err(|e| e.to_string())
            })
            .clone()
            .map_err(|e| {
                Error::internal(
                    format!("metrics recorder could not be installed: {e}"),
                    "another recorder was installed outside chassis; remove it, the kit owns /metrics",
                )
            })?;
        let m = Self {
            prefix: prefix.to_string(),
            handle,
            started: Instant::now(),
            sources: Arc::new(sources),
        };
        metrics::gauge!(format!("{}_build_info", m.prefix), "version" => version.to_string())
            .set(1.0);
        Ok(m)
    }

    /// The name of the kit's request counter under this prefix.
    pub fn requests_total(&self) -> String {
        format!("{}_http_requests_total", self.prefix)
    }

    /// Render everything: kit registry, then project sources verbatim.
    pub fn render(&self) -> String {
        metrics::gauge!(format!("{}_uptime_seconds", self.prefix))
            .set(self.started.elapsed().as_secs_f64());
        let mut out = self.handle.render();
        for s in self.sources.iter() {
            let text = s.scrape();
            if !out.ends_with('\n') {
                out.push('\n');
            }
            out.push_str(&text);
        }
        out
    }
}

/// The axum handler.
pub async fn metrics_handler(State(m): State<Metrics>) -> Response {
    (
        [(
            header::CONTENT_TYPE,
            "text/plain; version=0.0.4; charset=utf-8",
        )],
        m.render(),
    )
        .into_response()
}

/// A counter that formats itself (feat-metrics-1): the HELP line, the
/// TYPE line and one escaped sample per label set, so no project writes
/// exposition text by hand again. Clone it freely — every clone counts
/// into the same series.
///
/// ```no_run
/// # use chassis::{AppSpec, Counter};
/// let spec = AppSpec { name: "inbox", ..Default::default() };
/// let delivered = Counter::new(&spec.metric_prefix(), "deliveries_total", "Messages delivered.");
/// // app.metrics_source(delivered.clone());
/// delivered.inc(&[("topic", "alerts"), ("state", "done")]);
/// ```
#[derive(Clone)]
pub struct Counter(Arc<Series<u64>>);

/// A gauge that formats itself (feat-metrics-1): a value that goes up and
/// down, set from wherever the project knows it. Clone it freely — every
/// clone writes the same series.
#[derive(Clone)]
pub struct Gauge(Arc<Series<f64>>);

impl Counter {
    /// `prefix` is the project's metric prefix — `AppSpec::metric_prefix()`,
    /// the prefix the kit's own series already carry.
    pub fn new(prefix: &str, name: &str, help: &str) -> Self {
        Self(Arc::new(Series::new(prefix, name, help, "counter")))
    }

    /// The full metric name as it appears in the exposition text.
    pub fn name(&self) -> &str {
        &self.0.name
    }

    /// Count one event under this label set, creating the series at 0 first.
    pub fn inc(&self, labels: &[(&str, &str)]) {
        self.add(labels, 1);
    }

    /// Count `n` events. A counter never decreases (the homelab checks
    /// that), so there is no `sub` and the add saturates.
    pub fn add(&self, labels: &[(&str, &str)], n: u64) {
        let mut values = self.0.values();
        let slot = values.entry(labels_of(labels)).or_insert(0);
        *slot = slot.saturating_add(n);
    }
}

impl Gauge {
    /// `prefix` is the project's metric prefix — `AppSpec::metric_prefix()`.
    pub fn new(prefix: &str, name: &str, help: &str) -> Self {
        Self(Arc::new(Series::new(prefix, name, help, "gauge")))
    }

    /// The full metric name as it appears in the exposition text.
    pub fn name(&self) -> &str {
        &self.0.name
    }

    /// Set the value for one label set.
    pub fn set(&self, labels: &[(&str, &str)], value: f64) {
        self.0.values().insert(labels_of(labels), value);
    }

    /// Forget every series. A gauge over a label set that comes and goes
    /// (a topic that was deleted) would otherwise report its last value
    /// forever; recompute by clearing and setting what still exists.
    pub fn clear(&self) {
        self.0.values().clear();
    }
}

#[cfg(test)]
mod tests;
