//! The bounded availability history behind the status page's last-48-hours
//! strip, and the exact duration and date words the page uses. Its own module
//! because it is the only part of the sections that keeps state over time.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use serde::Serialize;

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
pub(super) struct Hour {
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
    pub(super) hours: Arc<Mutex<VecDeque<Hour>>>,
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
