//! How a status section's body is laid out and shown: the width each body
//! asks for, the packing of cards into rows of twelve columns, the slug of a
//! card and the JSON a flash action renders to. Its own module because it is
//! the crate-internal side of the section types, which stay declared in the
//! parent.

use super::*;

impl SectionBody {
    /// The bodies a section draws, in order: itself, or what a
    /// [`SectionBody::Many`] holds (flattened; a `Json` among several is
    /// dropped, because a card that reads its own data owns the card).
    pub(crate) fn parts(&self) -> Vec<&SectionBody> {
        match self {
            Self::Many(list) => {
                let mut out = Vec::new();
                for b in list {
                    for part in b.parts() {
                        if matches!(part, Self::Json { .. }) {
                            tracing::warn!(
                                "a Json body inside SectionBody::Many is left out: it owns its card"
                            );
                        } else {
                            out.push(part);
                        }
                    }
                }
                out
            }
            other => vec![other],
        }
    }

    /// How each column of a table sorts: `number` when every cell reads as
    /// one (so 9 comes before 10), `text` otherwise.
    pub(crate) fn column_sorts(&self) -> Vec<&'static str> {
        match self {
            Self::Table { columns, rows, .. } => (0..columns.len())
                .map(|c| {
                    let cells: Vec<&str> = rows
                        .iter()
                        .filter_map(|r| r.get(c).map(|s| s.trim()))
                        .filter(|s| !s.is_empty())
                        .collect();
                    if !cells.is_empty() && cells.iter().all(|s| s.parse::<f64>().is_ok()) {
                        "number"
                    } else {
                        "text"
                    }
                })
                .collect(),
            _ => Vec::new(),
        }
    }

    /// The span a section card takes of the page's twelve columns; see
    /// [`pack_spans`].
    fn width(&self) -> Width {
        match self {
            Self::Json { .. } => Width::Narrow,
            Self::Many(_) => {
                let parts = self.parts();
                if parts.is_empty()
                    || parts
                        .iter()
                        .any(|p| matches!(p, Self::Table { .. } | Self::Rows(_)))
                {
                    Width::Full
                } else {
                    Width::Wide
                }
            }
            Self::Kpis(_) | Self::Checks(_) => Width::Wide,
            _ => Width::Full,
        }
    }
}

impl FlashAction {
    pub(crate) fn view(&self) -> serde_json::Value {
        let words = match &self.word {
            Some(w) => format!("{w},Refused"),
            None => "Done,Refused".to_string(),
        };
        serde_json::json!({
            "label": self.label,
            "route": super::super::attr_escape(&self.route),
            "method": self.method,
            "words": super::super::attr_escape(&words),
            "word": self.word,
            "toast": self.toast,
            "toast_one": self.toast_one,
            "destructive": self.confirm.is_some(),
            "confirm": self.confirm,
        })
    }
}

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
