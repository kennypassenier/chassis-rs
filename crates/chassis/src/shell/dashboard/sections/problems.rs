//! The problem list and the update card in words a person reads. Its own
//! module because these turn the project's reports (`Problem`, `UpdateView`)
//! into display facts and know nothing of section bodies.

use super::*;

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
pub(crate) fn problem_views(list: Vec<super::super::Problem>) -> Vec<ProblemView> {
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

pub(crate) fn update_facts(
    running: &str,
    v: &super::super::UpdateView,
    can_check: bool,
) -> UpdateFacts {
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
