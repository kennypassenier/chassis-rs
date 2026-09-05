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

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixed;
    impl ScrapeSource for Fixed {
        fn scrape(&self) -> String {
            "# TYPE kyu_deliveries gauge\nkyu_deliveries{topic=\"a\",subscription=\"b\",state=\"pending\"} 3\n".into()
        }
    }

    #[test]
    fn render_carries_build_info_uptime_and_verbatim_sources() {
        // One recorder per process: this is the only test that installs it.
        let m = Metrics::install("t", "4.5.6", vec![Arc::new(Fixed)]).unwrap();
        metrics::counter!(m.requests_total(), "route" => "/x", "status" => "200").increment(2);
        let text = m.render();
        assert!(text.contains("t_build_info{version=\"4.5.6\"} 1"), "{text}");
        assert!(text.contains("t_uptime_seconds"), "{text}");
        assert!(
            text.contains("t_http_requests_total{route=\"/x\",status=\"200\"} 2"),
            "{text}"
        );
        assert!(
            text.contains("kyu_deliveries{topic=\"a\",subscription=\"b\",state=\"pending\"} 3"),
            "{text}"
        );
        // Counters never decrease across scrapes (the homelab's never_decreases check).
        metrics::counter!(m.requests_total(), "route" => "/x", "status" => "200").increment(1);
        assert!(
            m.render()
                .contains("t_http_requests_total{route=\"/x\",status=\"200\"} 3")
        );
    }
}
