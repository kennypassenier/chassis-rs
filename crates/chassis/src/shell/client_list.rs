//! What the clients list shows besides the stored fields (kit-kp11, the
//! approved `clients-list` review): a client's standing, the four exact
//! counts, and dates a person reads (dd/mm/yyyy HH:mm, 24 h, Brussels).
//!
//! Pure functions of a [`ClientView`] and a moment, so the rules are
//! testable without a clock. Not public: the page and `/api/kit/clients`
//! are the only consumers.
//!
//! The rules, as Kenny approved them:
//!
//! - **revoked**: the token no longer works.
//! - **idle**: no call for 30 days, or never called 30 days after issue.
//! - **new** ("Not used yet"): never called, issued less than 30 days ago.
//! - **in use**: everything else.

use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc};
use serde::Serialize;

use crate::shell::clients_api::ClientView;

/// A client is idle after this many days without a call (or without a first
/// call after being issued).
pub(crate) const IDLE_AFTER_DAYS: i64 = 30;

/// Where a client stands, as one word the list, the filters and the counts
/// all agree on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub(crate) enum Standing {
    #[serde(rename = "in use")]
    InUse,
    #[serde(rename = "idle")]
    Idle,
    #[serde(rename = "new")]
    New,
    #[serde(rename = "revoked")]
    Revoked,
}

fn parse(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|t| t.with_timezone(&Utc))
}

/// Whole days from `then` to `now`, never negative. An unreadable moment
/// counts as zero days: a client is never called idle on a guess.
fn days_since(then: &str, now: DateTime<Utc>) -> i64 {
    parse(then)
        .map(|t| (now - t).num_days().max(0))
        .unwrap_or(0)
}

/// The standing of one client at `now`, with the days it has been idle
/// (0 unless it is idle).
pub(crate) fn standing(client: &ClientView, now: DateTime<Utc>) -> (Standing, i64) {
    if !client.active {
        return (Standing::Revoked, 0);
    }
    match client.last_used_at.as_deref() {
        None => {
            let days = days_since(&client.issued_at, now);
            if days >= IDLE_AFTER_DAYS {
                (Standing::Idle, days)
            } else {
                (Standing::New, 0)
            }
        }
        Some(last) => {
            let days = days_since(last, now);
            if days >= IDLE_AFTER_DAYS {
                (Standing::Idle, days)
            } else {
                (Standing::InUse, 0)
            }
        }
    }
}

/// The four figures of the list, plus the two totals the page needs: how
/// many are active and how many have ever been called (the first-client
/// walk-through ends with the first call).
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct Counts {
    pub all: usize,
    pub active: usize,
    pub in_use: usize,
    pub idle: usize,
    pub new: usize,
    pub revoked: usize,
    /// Clients with at least one call (`uses > 0`), revoked ones included.
    pub called: usize,
}

pub(crate) fn counts<'a>(states: impl IntoIterator<Item = (Standing, &'a ClientView)>) -> Counts {
    let mut c = Counts::default();
    for (standing, client) in states {
        c.all += 1;
        if client.active {
            c.active += 1;
        }
        if client.uses > 0 {
            c.called += 1;
        }
        match standing {
            Standing::InUse => c.in_use += 1,
            Standing::Idle => c.idle += 1,
            Standing::New => c.new += 1,
            Standing::Revoked => c.revoked += 1,
        }
    }
    c
}

/// The last Sunday of `month` in `year`.
fn last_sunday(year: i32, month: u32) -> NaiveDate {
    let last = NaiveDate::from_ymd_opt(year, month, 31).expect("March and October have 31 days");
    last - Duration::days(i64::from(last.weekday().num_days_from_sunday()))
}

/// Brussels is UTC+1, and UTC+2 from 01:00 UTC on the last Sunday of March
/// until 01:00 UTC on the last Sunday of October. Written out here because
/// the kit carries no time-zone database for one zone.
fn brussels_offset(at: DateTime<Utc>) -> Duration {
    let year = at.year();
    let start = Utc.from_utc_datetime(&last_sunday(year, 3).and_hms_opt(1, 0, 0).expect("01:00"));
    let end = Utc.from_utc_datetime(&last_sunday(year, 10).and_hms_opt(1, 0, 0).expect("01:00"));
    if at >= start && at < end {
        Duration::hours(2)
    } else {
        Duration::hours(1)
    }
}

/// `dd/mm/yyyy HH:mm`, 24 hours, Europe/Brussels (UI principles, rule 52).
/// A value that is not RFC 3339 is returned as it came: a wrong date is
/// worse than an ugly one.
pub(crate) fn brussels(value: &str) -> String {
    let Some(at) = parse(value) else {
        return value.to_string();
    };
    let local = at + brussels_offset(at);
    local.format("%d/%m/%Y %H:%M").to_string()
}

/// Just the date part, `dd/mm/yyyy`.
pub(crate) fn brussels_date(value: &str) -> String {
    brussels(value).chars().take(10).collect()
}

/// How long ago, in exact words: `12 s ago`, `2 min ago`, `3 h ago`,
/// `5 days ago`. A moment in the future reads as `0 s ago`.
pub(crate) fn ago_words(value: &str, now: DateTime<Utc>) -> String {
    let Some(then) = parse(value) else {
        return String::new();
    };
    let s = (now - then).num_seconds().max(0);
    if s < 60 {
        format!("{s} s ago")
    } else if s < 3600 {
        format!("{} min ago", s / 60)
    } else if s < 86_400 {
        format!("{} h ago", s / 3600)
    } else {
        let d = s / 86_400;
        format!("{d} {} ago", if d == 1 { "day" } else { "days" })
    }
}

#[cfg(test)]
mod tests;
