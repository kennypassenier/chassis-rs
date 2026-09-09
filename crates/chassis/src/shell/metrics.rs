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

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard};
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

/// A label set. Names are sorted and unique, so one label set is one
/// series however the caller ordered the pairs: Prometheus ignores label
/// order, while two samples for the same series reject the whole scrape.
type Labels = BTreeMap<String, String>;

/// Name, HELP and label-set → value for one metric. Shared by the counter
/// and the gauge; only the TYPE line and the value format differ.
struct Series<T> {
    name: String,
    help: String,
    kind: &'static str,
    values: Mutex<BTreeMap<Labels, T>>,
}

impl<T: Copy> Series<T> {
    fn new(prefix: &str, name: &str, help: &str, kind: &'static str) -> Self {
        Self {
            name: qualify(prefix, name),
            help: help.to_string(),
            kind,
            values: Mutex::new(BTreeMap::new()),
        }
    }

    /// A poisoned lock must not take the scrape down — a service whose
    /// metrics vanish looks dead to the monitoring, which is the failure
    /// mode this type exists to prevent. The map stays a consistent map
    /// whatever panicked while holding it.
    fn values(&self) -> MutexGuard<'_, BTreeMap<Labels, T>> {
        self.values
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn render(&self, fmt: impl Fn(T) -> String) -> String {
        // HELP, then TYPE, then the samples, once each and one block per
        // metric name: any other order is rejected by the parser.
        let mut out = format!(
            "# HELP {} {}\n# TYPE {} {}\n",
            self.name,
            escape_help(&self.help),
            self.name,
            self.kind
        );
        for (labels, value) in self.values().iter() {
            out.push_str(&self.name);
            if !labels.is_empty() {
                let pairs: Vec<String> = labels
                    .iter()
                    .map(|(k, v)| format!("{k}=\"{}\"", escape_label_value(v)))
                    .collect();
                out.push('{');
                out.push_str(&pairs.join(","));
                out.push('}');
            }
            out.push(' ');
            out.push_str(&fmt(*value));
            out.push('\n');
        }
        out
    }
}

/// `<prefix>_<name>`, unless the name already carries the prefix (a
/// project moving off hand-written `format!` passes the full name it has
/// been exposing) or there is no prefix to add.
fn qualify(prefix: &str, name: &str) -> String {
    let prefix = sanitize(prefix.trim_end_matches('_'), true);
    let name = sanitize(name, true);
    if prefix.is_empty() || name == prefix || name.starts_with(&format!("{prefix}_")) {
        name
    } else {
        format!("{prefix}_{name}")
    }
}

/// Metric and label names cannot be escaped — an invalid character there
/// rejects the scrape exactly like an unescaped value does — so whatever
/// Prometheus does not allow becomes `_`. A colon is legal in a metric
/// name, never in a label name.
fn sanitize(s: &str, metric: bool) -> String {
    let mut out = String::with_capacity(s.len());
    for (i, c) in s.chars().enumerate() {
        let body = c.is_ascii_alphanumeric() || c == '_' || (metric && c == ':');
        let head = c.is_ascii_alphabetic() || c == '_' || (metric && c == ':');
        out.push(if body && (i > 0 || head) { c } else { '_' });
    }
    out
}

/// A label value is the one place a project's own data reaches the
/// exposition text, and an unescaped one invalidates the WHOLE scrape.
fn escape_label_value(v: &str) -> String {
    let mut out = String::with_capacity(v.len());
    for c in v.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            _ => out.push(c),
        }
    }
    out
}

/// HELP runs to the end of its line, so only a backslash and a newline
/// need escaping there; a quote is ordinary text.
fn escape_help(help: &str) -> String {
    let mut out = String::with_capacity(help.len());
    for c in help.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            _ => out.push(c),
        }
    }
    out
}

/// `Inf` and `NaN` are spelled Go's way in the text format; Rust's own
/// `inf` is not accepted.
fn format_f64(v: f64) -> String {
    if v.is_nan() {
        "NaN".to_string()
    } else if v.is_infinite() {
        if v.is_sign_positive() {
            "+Inf".to_string()
        } else {
            "-Inf".to_string()
        }
    } else {
        format!("{v}")
    }
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

impl ScrapeSource for Counter {
    fn scrape(&self) -> String {
        self.0.render(|v| v.to_string())
    }
}

/// A gauge that formats itself (feat-metrics-1): a value that goes up and
/// down, set from wherever the project knows it. Clone it freely — every
/// clone writes the same series.
#[derive(Clone)]
pub struct Gauge(Arc<Series<f64>>);

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

impl ScrapeSource for Gauge {
    fn scrape(&self) -> String {
        self.0.render(format_f64)
    }
}

fn labels_of(labels: &[(&str, &str)]) -> Labels {
    labels
        .iter()
        .map(|(k, v)| (sanitize(k, false), (*v).to_string()))
        .collect()
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
        // One recorder per process; `install` hands every caller the same
        // handle, so a second install in another test is harmless.
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

    /// feat-metrics-1: the expensive failure. An unescaped quote,
    /// backslash or newline in a label value invalidates the WHOLE
    /// scrape, so the kit's own metrics disappear with it.
    #[test]
    fn label_values_are_escaped_for_the_text_format() {
        let c = Counter::new("inbox", "rejects_total", "Messages rejected.");
        c.inc(&[("reason", "quote \" backslash \\ newline \n end")]);
        assert_eq!(
            c.scrape(),
            "# HELP inbox_rejects_total Messages rejected.\n\
             # TYPE inbox_rejects_total counter\n\
             inbox_rejects_total{reason=\"quote \\\" backslash \\\\ newline \\n end\"} 1\n"
        );
    }

    /// HELP once, TYPE once, in that order, before any sample — the
    /// forgotten-TYPE and repeated-HELP failures cannot be written.
    #[test]
    fn help_and_type_appear_once_each_before_the_samples() {
        let g = Gauge::new("inbox", "queue_depth", "Messages waiting.");
        g.set(&[("topic", "a")], 2.0);
        g.set(&[("topic", "b")], 3.5);
        g.set(&[("topic", "a")], 4.0);
        let text = g.scrape();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(
            lines,
            vec![
                "# HELP inbox_queue_depth Messages waiting.",
                "# TYPE inbox_queue_depth gauge",
                "inbox_queue_depth{topic=\"a\"} 4",
                "inbox_queue_depth{topic=\"b\"} 3.5",
            ],
            "{text}"
        );
        assert_eq!(text.matches("# HELP").count(), 1, "{text}");
        assert_eq!(text.matches("# TYPE").count(), 1, "{text}");
    }

    /// An empty counter still declares itself: a dashboard or an alert on
    /// the series sees 'no samples yet', not 'metric does not exist'.
    #[test]
    fn an_empty_counter_renders_help_and_type_and_no_samples() {
        let c = Counter::new("inbox", "deliveries_total", "Messages delivered.");
        assert_eq!(
            c.scrape(),
            "# HELP inbox_deliveries_total Messages delivered.\n\
             # TYPE inbox_deliveries_total counter\n"
        );
    }

    /// The project's prefix, once: `metric_prefix()` fed in, and a name
    /// that already carries it is not prefixed twice.
    #[test]
    fn the_name_carries_the_project_prefix_exactly_once() {
        assert_eq!(
            Counter::new("kyu", "deliveries_total", "h").name(),
            "kyu_deliveries_total"
        );
        assert_eq!(
            Counter::new("kyu", "kyu_deliveries_total", "h").name(),
            "kyu_deliveries_total"
        );
        assert_eq!(Gauge::new("", "standalone", "h").name(), "standalone");
        // A dashed name never reaches the text format as a dash.
        assert_eq!(
            Gauge::new("kyu-runner", "in flight", "h").name(),
            "kyu_runner_in_flight"
        );
    }

    /// The counter is a `ScrapeSource`, and its block survives the kit's
    /// own concatenation onto `/metrics` unchanged.
    #[test]
    fn a_counter_registers_as_a_scrape_source_and_survives_concatenation() {
        let c = Counter::new("t", "widgets_total", "Widgets seen.");
        c.add(&[("kind", "big")], 5);
        let source: Arc<dyn ScrapeSource> = Arc::new(c.clone());
        let m = Metrics::install("t", "4.5.6", vec![source]).unwrap();
        let text = m.render();
        assert!(text.contains(&c.scrape()), "{text}");
        assert!(text.contains("t_build_info"), "{text}");
        // Nothing runs into the preceding block's last line.
        for line in text.lines() {
            assert!(
                !line.contains("# HELP t_widgets_total") || line.starts_with("# HELP"),
                "{text}"
            );
        }
    }
}
