//! The constructors and builder methods of the pub section types: body rows,
//! tables and JSON, KPI tiles, checks and flash actions.

use super::{Check, CheckState, FlashAction, JsonRender, Kpi, KpiTone, SectionBody};

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
