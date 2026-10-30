//! The Prometheus text format: label sets, one `Series`, name
//! sanitising and value escaping. Its own module because getting any of it
//! wrong invalidates a whole scrape, so it is read apart from the plumbing.

use std::collections::BTreeMap;
use std::sync::{Mutex, MutexGuard};

/// A label set. Names are sorted and unique, so one label set is one
/// series however the caller ordered the pairs: Prometheus ignores label
/// order, while two samples for the same series reject the whole scrape.
pub(super) type Labels = BTreeMap<String, String>;

/// Name, HELP and label-set → value for one metric. Shared by the counter
/// and the gauge; only the TYPE line and the value format differ.
pub(super) struct Series<T> {
    pub(super) name: String,
    help: String,
    kind: &'static str,
    values: Mutex<BTreeMap<Labels, T>>,
}

impl<T: Copy> Series<T> {
    pub(super) fn new(prefix: &str, name: &str, help: &str, kind: &'static str) -> Self {
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
    pub(super) fn values(&self) -> MutexGuard<'_, BTreeMap<Labels, T>> {
        self.values
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub(super) fn render(&self, fmt: impl Fn(T) -> String) -> String {
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
pub(super) fn sanitize(s: &str, metric: bool) -> String {
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
pub(super) fn format_f64(v: f64) -> String {
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

pub(super) fn labels_of(labels: &[(&str, &str)]) -> Labels {
    labels
        .iter()
        .map(|(k, v)| (sanitize(k, false), (*v).to_string()))
        .collect()
}
