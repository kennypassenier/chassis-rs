//! What a status section can be, and the facts the status page draws
//! beside it (kit-kp11).
//!
//! Until 3.8.0 a section was label/value rows or HTML the project vouched
//! for. [`SectionBody`] adds the shapes a service actually has: a sortable
//! table, key figures, check rows and a card that reads its own JSON. It is
//! additive on purpose: [`Section`](super::Section) is built as a struct
//! literal by consumers, so a new field there would break them; a section
//! opts in through [`StatusSection::body`](super::StatusSection::body), and
//! `Section::html` stays the escape hatch.
//!
//! The same file holds the small bounded availability history behind the
//! status page's last-48-hours strip, and the plain-language helpers that
//! keep internal words (`update_mode`, a knob's name) out of user text.

use serde::Serialize;

mod layout;
mod problems;
#[cfg(test)]
mod tests;
mod uptime;

pub(crate) use layout::{pack_spans, slug};
pub(crate) use problems::{problem_views, update_facts};
pub(crate) use uptime::{Sample, UptimeHistory, span_words, when_words};

/// The body of a status section.
///
/// Every variant is drawn by the kit with kp-themes parts, so a service
/// writes data, not markup, and the section keeps its footprint while it
/// loads, is empty or fails.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case")]
#[non_exhaustive]
pub enum SectionBody {
    /// Label/value lines; what `Section::rows` always was.
    Rows(Vec<(String, String)>),
    /// A data table that sorts, searches and remembers what the reader did.
    /// `key` is the index of the column whose value identifies a row (a row
    /// keeps its place and its selection across refreshes).
    Table {
        columns: Vec<String>,
        rows: Vec<Vec<String>>,
        key: usize,
    },
    /// Key figures, one tile each.
    Kpis(Vec<Kpi>),
    /// Check rows: one line per thing that can pass or fail.
    Checks(Vec<Check>),
    /// A card that fetches `url` itself (same origin, with the session) and
    /// draws the answer as `render`; the card shows loading, empty and
    /// failed by itself, with Try again. It stands alone in its section:
    /// inside [`SectionBody::Many`] it is left out and logged.
    Json { url: String, render: JsonRender },
    /// Several bodies in one section, in order: key figures over the checks
    /// behind them, a table under a summary.
    Many(Vec<SectionBody>),
}

impl SectionBody {
    /// Label/value lines.
    pub fn rows<L: Into<String>, V: Into<String>>(rows: impl IntoIterator<Item = (L, V)>) -> Self {
        Self::Rows(
            rows.into_iter()
                .map(|(l, v)| (l.into(), v.into()))
                .collect(),
        )
    }

    /// A table whose first column identifies a row.
    pub fn table<C: Into<String>, V: Into<String>>(
        columns: impl IntoIterator<Item = C>,
        rows: impl IntoIterator<Item = Vec<V>>,
    ) -> Self {
        Self::Table {
            columns: columns.into_iter().map(Into::into).collect(),
            rows: rows
                .into_iter()
                .map(|r| r.into_iter().map(Into::into).collect())
                .collect(),
            key: 0,
        }
    }

    /// A card that reads `url` and draws it as `render`.
    pub fn json(url: &str, render: JsonRender) -> Self {
        Self::Json {
            url: url.to_string(),
            render,
        }
    }

    /// Choose another identifying column of a table (no effect on the
    /// other variants).
    pub fn keyed_by(mut self, column: usize) -> Self {
        if let Self::Table { key, .. } = &mut self {
            *key = column;
        }
        self
    }
}

/// How a [`SectionBody::Json`] answer is drawn.
///
/// * `Rows`: an object (`{"store": "writable"}`), a list of
///   `[label, value]` pairs or a list of `{label, value}`; a nested object
///   that has a `detail` shows the detail, and a `status` of `ok` /
///   `degraded` gets a health dot.
/// * `Checks`: a list of `{name, ok, detail}` or an object of
///   `name: {ok, detail}` (the shape of `/healthz` subsystems).
/// * `Kpis`: a list of `{label, value, note}`.
/// * `Table`: `{columns: [...], rows: [[...]]}`.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[non_exhaustive]
pub enum JsonRender {
    Rows,
    Checks,
    Kpis,
    Table,
}

/// One key figure.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[non_exhaustive]
pub struct Kpi {
    pub label: String,
    pub value: String,
    /// The small line under the value.
    pub note: Option<String>,
    pub tone: Option<KpiTone>,
}

impl Kpi {
    pub fn new(label: &str, value: impl ToString) -> Self {
        Self {
            label: label.to_string(),
            value: value.to_string(),
            note: None,
            tone: None,
        }
    }

    pub fn note(mut self, note: &str) -> Self {
        self.note = Some(note.to_string());
        self
    }

    pub fn tone(mut self, tone: KpiTone) -> Self {
        self.tone = Some(tone);
        self
    }
}

/// The tone of a key figure; never the only signal (the note says it too).
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[non_exhaustive]
pub enum KpiTone {
    Success,
    Warning,
    Destructive,
}

/// One check row.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[non_exhaustive]
pub struct Check {
    pub name: String,
    pub state: CheckState,
    pub detail: String,
}

impl Check {
    pub fn new(name: &str, state: CheckState, detail: &str) -> Self {
        Self {
            name: name.to_string(),
            state,
            detail: detail.to_string(),
        }
    }

    pub fn ok(name: &str, detail: &str) -> Self {
        Self::new(name, CheckState::Ok, detail)
    }

    pub fn failed(name: &str, detail: &str) -> Self {
        Self::new(name, CheckState::Failed, detail)
    }

    pub fn warn(name: &str, detail: &str) -> Self {
        Self::new(name, CheckState::Warn, detail)
    }
}

/// What a check says. Each state has its own shape as well as its colour.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[non_exhaustive]
pub enum CheckState {
    Ok,
    Warn,
    Failed,
}

/// A button under a section that does its work without leaving the page:
/// a spinner while it runs, a short word after, and a toast that can carry
/// a count ("Retried 12 entries"). Registered through
/// [`StatusSection::flash_actions`](super::StatusSection::flash_actions).
///
/// The route is the project's own (registered with `dashboard_routes`). A
/// 2xx answer is a success; a JSON body may carry `{"count": 12}` for the
/// toast, and a refusal's `{error, remedy}` is shown under the button.
///
/// This is a type of its own because [`SectionAction`](super::SectionAction)
/// is an open struct that services build as a literal, so a new field there
/// would break them; the older action keeps its reload.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[non_exhaustive]
pub struct FlashAction {
    pub label: String,
    pub route: String,
    /// `POST` (default) or `DELETE`.
    pub method: String,
    /// The word the button shows after it worked (default `Done`).
    pub word: Option<String>,
    /// The toast, `{n}` standing for the count the route answered.
    pub toast: Option<String>,
    /// The toast when the count is exactly 1.
    pub toast_one: Option<String>,
    /// Arm-before-act phrase; present means the action is destructive.
    pub confirm: Option<String>,
}

impl FlashAction {
    /// A non-destructive POST.
    pub fn post(label: &str, route: &str) -> Self {
        Self {
            label: label.to_string(),
            route: route.to_string(),
            method: "POST".to_string(),
            word: None,
            toast: None,
            toast_one: None,
            confirm: None,
        }
    }

    pub fn method(mut self, method: &str) -> Self {
        self.method = method.to_string();
        self
    }

    /// The short word on the button after it worked.
    pub fn word(mut self, word: &str) -> Self {
        self.word = Some(word.to_string());
        self
    }

    /// The success toast; `{n}` becomes the route's `count`.
    pub fn toast(mut self, template: &str) -> Self {
        self.toast = Some(template.to_string());
        self
    }

    /// The toast for a count of exactly 1 (`Retried 1 entry`).
    pub fn toast_one(mut self, text: &str) -> Self {
        self.toast_one = Some(text.to_string());
        self
    }

    /// Mark it destructive: the first press arms it with this phrase, the
    /// second acts.
    pub fn destructive(mut self, confirm: &str) -> Self {
        self.confirm = Some(confirm.to_string());
        self
    }
}
