//! Unit tests for `metrics`; kept in their own file so the module stays small.

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
