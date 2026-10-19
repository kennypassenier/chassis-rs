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

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use serde::Serialize;

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
    /// failed by itself, with Try again.
    Json { url: String, render: JsonRender },
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

    /// The span a section card takes of the page's twelve columns; see
    /// [`pack_spans`].
    fn width(&self) -> Width {
        match self {
            Self::Kpis(_) | Self::Checks(_) => Width::Wide,
            Self::Json { .. } => Width::Narrow,
            _ => Width::Full,
        }
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

    pub(crate) fn view(&self) -> serde_json::Value {
        let words = match &self.word {
            Some(w) => format!("{w},Refused"),
            None => "Done,Refused".to_string(),
        };
        serde_json::json!({
            "label": self.label,
            "route": super::attr_escape(&self.route),
            "method": self.method,
            "words": super::attr_escape(&words),
            "word": self.word,
            "toast": self.toast,
            "toast_one": self.toast_one,
            "destructive": self.confirm.is_some(),
            "confirm": self.confirm,
        })
    }
}

// ---------------------------------------------------------------- layout --

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Width {
    /// All twelve columns.
    Full,
    /// Eight columns when a narrow card can stand beside it.
    Wide,
    /// A third of the page, or less when it stands with others.
    Narrow,
}

/// The columns each section card takes of twelve, so a row of cards always
/// adds up (a composition, not a left/right leftover): a wide card with a
/// narrow one beside it is 8 + 4, three narrow ones are 4 + 4 + 4, two
/// are 6 + 6, and anything alone fills the row.
pub(crate) fn pack_spans(bodies: &[Option<&SectionBody>]) -> Vec<u8> {
    let widths: Vec<Width> = bodies
        .iter()
        .map(|b| b.map_or(Width::Full, SectionBody::width))
        .collect();
    let mut spans = vec![12u8; widths.len()];
    let mut i = 0;
    while i < widths.len() {
        match widths[i] {
            Width::Wide if widths.get(i + 1) == Some(&Width::Narrow) => {
                spans[i] = 8;
                spans[i + 1] = 4;
                i += 2;
            }
            Width::Narrow if widths.get(i + 1) == Some(&Width::Wide) => {
                spans[i] = 4;
                spans[i + 1] = 8;
                i += 2;
            }
            Width::Narrow => {
                let run = widths[i..]
                    .iter()
                    .take(3)
                    .take_while(|w| **w == Width::Narrow)
                    .count();
                let span = 12 / run as u8;
                for s in &mut spans[i..i + run] {
                    *s = span;
                }
                i += run;
            }
            _ => i += 1,
        }
    }
    spans
}

/// A stable, readable id for a section card: the title as a slug.
pub(crate) fn slug(title: &str, index: usize) -> String {
    let mut out = String::new();
    for c in title.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out = out.trim_end_matches('-');
    if out.is_empty() {
        format!("section-{index}")
    } else {
        format!("{out}-{index}")
    }
}

// -------------------------------------------------------------- problems --

/// A problem as the status page and `/api/kit/status` carry it: what the
/// project or the kit reported, a stable key, a severity and, when the
/// remedy quotes one, the command to copy.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub(crate) struct ProblemView {
    pub key: String,
    pub severity: &'static str,
    pub what: String,
    pub why: String,
    pub remedy: String,
    pub command: Option<String>,
}

/// The command a remedy quotes: the first `backticked` span that holds a
/// space (`inbox gen-secret`), because a lone word in backticks is a name
/// (`INBOX_TOKEN`), not something to paste into a terminal.
pub(crate) fn command_in(remedy: &str) -> Option<String> {
    remedy
        .split('`')
        .skip(1)
        .step_by(2)
        .map(str::trim)
        .find(|span| span.contains(' ') && span.len() <= 200)
        .map(str::to_string)
}

/// The worst problem is critical, the rest are warnings: a configuration
/// the service could see but not use is never an outage by itself, but the
/// first one reported is the one that decides what to do first.
pub(crate) fn problem_views(list: Vec<super::Problem>) -> Vec<ProblemView> {
    list.into_iter()
        .enumerate()
        .map(|(i, p)| ProblemView {
            key: format!("p{i}"),
            severity: if i == 0 { "critical" } else { "warning" },
            command: command_in(&p.remedy),
            what: p.what,
            why: p.why,
            remedy: p.remedy,
        })
        .collect()
}

// ---------------------------------------------------------------- updates --

/// The update card in words a person reads.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub(crate) struct UpdateFacts {
    /// `unavailable` (no updater compiled in), `off`, `supervised`,
    /// `autonomous`.
    pub mode: String,
    /// What the mode means for this service, in a sentence.
    pub mode_label: String,
    /// The newest release the service has seen, when it has seen one.
    pub latest: Option<String>,
    /// Whether `latest` differs from what is running.
    pub newer: bool,
    /// When it last looked, RFC 3339.
    pub last_check_at: Option<String>,
    /// One plain sentence under the facts, when there is something to say.
    pub note: Option<String>,
    /// There is a checker behind the "Check for updates" button.
    pub can_check: bool,
}

fn looks_like_version(s: &str) -> bool {
    let s = s.trim().trim_start_matches('v');
    s.chars().next().is_some_and(|c| c.is_ascii_digit()) && !s.contains(' ')
}

pub(crate) fn update_facts(running: &str, v: &super::UpdateView, can_check: bool) -> UpdateFacts {
    let mode = match v.mode.as_str() {
        "off" | "supervised" | "autonomous" => v.mode.clone(),
        _ => "unavailable".to_string(),
    };
    let mode_label = match mode.as_str() {
        "off" => "Off: it only looks for new releases",
        "supervised" => "Looks for new releases; you install them",
        "autonomous" => "Installs new releases by itself",
        _ => "Not available in this service",
    }
    .to_string();
    let latest =
        looks_like_version(&v.latest).then(|| v.latest.trim_start_matches('v').to_string());
    let newer = latest.as_deref().is_some_and(|l| l != running);
    let last_check_at = (v.last_check.contains('T')).then(|| v.last_check.clone());
    UpdateFacts {
        mode,
        mode_label,
        latest,
        newer,
        last_check_at,
        note: v.note.as_deref().and_then(plain_update_note),
        can_check,
    }
}

/// The update note without the knob names it was written with: a reader
/// of the page has never seen `update_mode`. What cannot be said in plain
/// words is left out; the log still carries the original.
pub(crate) fn plain_update_note(note: &str) -> Option<String> {
    let kept: Vec<String> = note
        .split("; ")
        .filter_map(|piece| {
            let p = piece.trim();
            if p.is_empty() || p.contains("update_mode") {
                None
            } else if p.contains("update_pubkey") {
                Some("The key that signs updates was changed from its default".to_string())
            } else if p.contains("update_url") {
                Some("No release address is set, so there is nothing to check".to_string())
            } else {
                Some(p.to_string())
            }
        })
        .collect();
    (!kept.is_empty()).then(|| kept.join(". "))
}

// ---------------------------------------------------------------- uptime --

/// What one health check said.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Sample {
    Up,
    Degraded,
    Down,
}

impl Sample {
    /// `down` is every part failing; one failing part is degraded.
    pub fn from_report(status_ok: bool, parts: usize, failing: usize) -> Self {
        if status_ok {
            Sample::Up
        } else if parts > 0 && failing == parts {
            Sample::Down
        } else {
            Sample::Degraded
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct Hour {
    /// Hours since the Unix epoch.
    hour: u64,
    up: u32,
    degraded: u32,
    down: u32,
}

/// The last 48 hours, one state per hour, kept in memory only: a restart
/// empties it, and the hours before it show as "no data" (the gap is the
/// restart). Persisting it would need a file under the state directory;
/// that is a decision for the release, not for this page.
#[derive(Debug, Clone, Default)]
pub(crate) struct UptimeHistory {
    hours: Arc<Mutex<VecDeque<Hour>>>,
}

/// Hours the strip shows.
pub(crate) const UPTIME_HOURS: u64 = 48;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub(crate) struct UptimePeriod {
    pub key: String,
    /// `HH:00` in UTC; the page relabels it in the reader's zone from `at`.
    pub label: String,
    /// The hour's start, RFC 3339.
    pub at: String,
    pub state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uptime: Option<f64>,
    pub details: Vec<String>,
}

impl UptimeHistory {
    pub fn record(&self, sample: Sample) {
        self.record_at(crate::shell::time::now_epoch(), sample);
    }

    pub fn record_at(&self, epoch: u64, sample: Sample) {
        let hour = epoch / 3600;
        let mut hours = self.hours.lock().expect("uptime lock");
        if hours.back().map(|h| h.hour) != Some(hour) {
            hours.push_back(Hour {
                hour,
                ..Hour::default()
            });
        }
        while hours.front().is_some_and(|h| h.hour + UPTIME_HOURS <= hour) {
            hours.pop_front();
        }
        let current = hours.back_mut().expect("just pushed");
        match sample {
            Sample::Up => current.up += 1,
            Sample::Degraded => current.degraded += 1,
            Sample::Down => current.down += 1,
        }
    }

    pub fn periods(&self) -> Vec<UptimePeriod> {
        self.periods_at(crate::shell::time::now_epoch())
    }

    pub fn periods_at(&self, epoch: u64) -> Vec<UptimePeriod> {
        let now_hour = epoch / 3600;
        let hours = self.hours.lock().expect("uptime lock");
        (0..UPTIME_HOURS)
            .rev()
            .map(|back| {
                let hour = now_hour.saturating_sub(back);
                let at =
                    chrono::DateTime::from_timestamp((hour * 3600) as i64, 0).unwrap_or_default();
                let found = hours.iter().find(|h| h.hour == hour);
                let (state, uptime, details) = match found {
                    None => (
                        "none",
                        None,
                        vec!["Nothing was recorded this hour".to_string()],
                    ),
                    Some(h) => {
                        let total = h.up + h.degraded + h.down;
                        let state = if h.down > 0 {
                            "down"
                        } else if h.degraded > 0 {
                            "degraded"
                        } else {
                            "up"
                        };
                        let mut lines = vec![format!(
                            "Checked {total} {}",
                            if total == 1 { "time" } else { "times" }
                        )];
                        if h.down > 0 {
                            lines.push(format!("Every part failed in {}", h.down));
                        }
                        if h.degraded > 0 {
                            lines.push(format!("One part or more failed in {}", h.degraded));
                        }
                        (
                            state,
                            Some(f64::from(h.up) / f64::from(total.max(1))),
                            lines,
                        )
                    }
                };
                UptimePeriod {
                    key: format!("h{hour}"),
                    label: at.format("%H:00").to_string(),
                    at: at.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
                    state,
                    uptime,
                    details,
                }
            })
            .collect()
    }
}

// ------------------------------------------------------------------ words --

/// A duration in words, exact: `under 1 min`, `14 min`, `10 h 2 min`,
/// `3 days 4 h`.
pub(crate) fn span_words(secs: u64) -> String {
    let m = secs / 60;
    if m < 1 {
        return "under 1 min".to_string();
    }
    if m < 60 {
        return format!("{m} min");
    }
    let h = m / 60;
    if h < 48 {
        return format!("{h} h {} min", m % 60);
    }
    format!("{} days {} h", h / 24, h % 24)
}

/// `dd/mm/yyyy HH:mm`, 24 hours, UTC: the server's fallback; the page
/// shows it in the reader's own zone once the script has run. A value that
/// is not RFC 3339 is returned as it came.
pub(crate) fn when_words(rfc3339: &str) -> String {
    match chrono::DateTime::parse_from_rfc3339(rfc3339) {
        Ok(t) => t
            .with_timezone(&chrono::Utc)
            .format("%d/%m/%Y %H:%M")
            .to_string(),
        Err(_) => rfc3339.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(bodies: &[Option<SectionBody>]) -> Vec<u8> {
        pack_spans(&bodies.iter().map(Option::as_ref).collect::<Vec<_>>())
    }

    fn wide() -> Option<SectionBody> {
        Some(SectionBody::Kpis(vec![]))
    }

    fn narrow() -> Option<SectionBody> {
        Some(SectionBody::json("/x", JsonRender::Rows))
    }

    #[test]
    fn a_row_of_cards_always_adds_up_to_twelve() {
        assert_eq!(kinds(&[None, wide(), narrow()]), [12, 8, 4]);
        assert_eq!(kinds(&[narrow(), wide()]), [4, 8]);
        assert_eq!(kinds(&[narrow()]), [12]);
        assert_eq!(kinds(&[narrow(), narrow()]), [6, 6]);
        assert_eq!(kinds(&[narrow(), narrow(), narrow()]), [4, 4, 4]);
        assert_eq!(
            kinds(&[narrow(), narrow(), narrow(), narrow()]),
            [4, 4, 4, 12]
        );
        assert_eq!(kinds(&[wide()]), [12]);
        assert_eq!(kinds(&[wide(), wide()]), [12, 12]);
    }

    #[test]
    fn a_command_is_a_backticked_span_with_a_space() {
        assert_eq!(
            command_in("run `inbox gen-secret` on a terminal").as_deref(),
            Some("inbox gen-secret")
        );
        assert_eq!(command_in("set `INBOX_TOKEN` first"), None);
        assert_eq!(command_in("nothing quoted"), None);
    }

    #[test]
    fn the_first_problem_is_critical_and_the_rest_warn() {
        let p = |w: &str| super::super::Problem {
            what: w.into(),
            why: "why".into(),
            remedy: "fix".into(),
        };
        let v = problem_views(vec![p("a"), p("b")]);
        assert_eq!(v[0].severity, "critical");
        assert_eq!(v[1].severity, "warning");
        assert_ne!(v[0].key, v[1].key);
    }

    #[test]
    fn update_notes_lose_the_knob_names() {
        assert_eq!(plain_update_note("update_mode is off"), None);
        assert_eq!(
            plain_update_note("update_mode is off; no release host configured (update_url / AppSpec.repository), so no version check")
                .as_deref(),
            Some("No release address is set, so there is nothing to check")
        );
        let n = plain_update_note("GET https://x/VERSION answered 404. What now: wait").unwrap();
        assert!(!n.contains("update_"), "{n}");
    }

    #[test]
    fn update_facts_read_the_free_text_of_the_view() {
        let v = super::super::UpdateView {
            mode: "supervised".into(),
            latest: "0.2.0".into(),
            last_check: "2026-10-19T08:00:00Z".into(),
            note: None,
        };
        let f = update_facts("0.1.0", &v, true);
        assert_eq!(f.latest.as_deref(), Some("0.2.0"));
        assert!(f.newer);
        assert!(f.last_check_at.is_some());
        let d = update_facts("0.1.0", &super::super::UpdateView::default(), false);
        assert_eq!(d.mode, "unavailable");
        assert_eq!(d.latest, None);
        assert!(!d.newer);
        assert_eq!(d.last_check_at, None);
    }

    #[test]
    fn the_history_is_bounded_and_hours_without_data_are_none() {
        let h = UptimeHistory::default();
        let t0 = 1_800_000_000u64 / 3600 * 3600;
        for i in 0..100u64 {
            h.record_at(t0 + i * 3600, Sample::Up);
        }
        assert!(h.hours.lock().unwrap().len() <= UPTIME_HOURS as usize);
        let now = t0 + 99 * 3600;
        let p = h.periods_at(now);
        assert_eq!(p.len(), 48);
        assert!(p.iter().all(|x| x.state == "up"));
        // An hour nobody recorded is "none", not "up".
        let later = h.periods_at(now + 3 * 3600);
        assert_eq!(later.iter().filter(|x| x.state == "none").count(), 3);
        assert_eq!(later.last().unwrap().state, "none");
    }

    #[test]
    fn the_worst_sample_of_an_hour_names_the_hour() {
        let h = UptimeHistory::default();
        let t = 1_800_000_000u64;
        h.record_at(t, Sample::Up);
        h.record_at(t + 60, Sample::Degraded);
        let p = h.periods_at(t);
        let last = p.last().unwrap();
        assert_eq!(last.state, "degraded");
        assert_eq!(last.uptime, Some(0.5));
        h.record_at(t + 120, Sample::Down);
        assert_eq!(h.periods_at(t).last().unwrap().state, "down");
    }

    #[test]
    fn durations_and_dates_are_exact_words() {
        assert_eq!(span_words(30), "under 1 min");
        assert_eq!(span_words(14 * 60), "14 min");
        assert_eq!(span_words(8 * 3600 + 2 * 60), "8 h 2 min");
        assert_eq!(span_words(3 * 86_400 + 4 * 3600), "3 days 4 h");
        assert_eq!(when_words("2026-10-19T07:39:02Z"), "19/10/2026 07:39");
        assert_eq!(when_words("never"), "never");
    }

    #[test]
    fn a_slug_is_readable_and_unique_by_index() {
        assert_eq!(slug("Messages", 0), "messages-0");
        assert_eq!(slug("Store, read live", 2), "store-read-live-2");
        assert_eq!(slug("—", 3), "section-3");
    }

    #[test]
    fn a_flash_action_view_escapes_what_lands_in_an_attribute() {
        let v = FlashAction::post("Retry", "/x\"y").word("Retried").view();
        assert_eq!(v["route"], "/x&quot;y");
        assert_eq!(v["words"], "Retried,Refused");
        assert_eq!(v["destructive"], false);
    }
}
