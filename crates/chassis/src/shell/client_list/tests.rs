//! Unit tests for `client_list`; kept in their own file so the module stays small.

use super::*;

fn at(s: &str) -> DateTime<Utc> {
    parse(s).expect("a test moment")
}

fn client(active: bool, issued: &str, last: Option<&str>, uses: u64) -> ClientView {
    ClientView {
        id: "id".into(),
        name: "n".into(),
        active,
        issued_at: issued.into(),
        revoked_at: (!active).then(|| issued.into()),
        last_used_at: last.map(str::to_string),
        uses,
        fields: Default::default(),
    }
}

#[test]
fn idle_is_thirty_days_without_a_call_or_without_a_first_call() {
    let now = at("2026-10-19T12:00:00Z");
    // Called yesterday: in use.
    let c = client(
        true,
        "2026-01-01T00:00:00Z",
        Some("2026-10-18T12:00:00Z"),
        4,
    );
    assert_eq!(standing(&c, now), (Standing::InUse, 0));
    // Last call 29 days and 23 hours ago: still in use; 30 days: idle.
    let c = client(
        true,
        "2026-01-01T00:00:00Z",
        Some("2026-09-19T13:00:00Z"),
        4,
    );
    assert_eq!(standing(&c, now).0, Standing::InUse);
    let c = client(
        true,
        "2026-01-01T00:00:00Z",
        Some("2026-09-19T12:00:00Z"),
        4,
    );
    assert_eq!(standing(&c, now), (Standing::Idle, 30));
    // Never called: new for 29 days, idle from the 30th day after issue.
    let c = client(true, "2026-09-20T12:00:00Z", None, 0);
    assert_eq!(standing(&c, now), (Standing::New, 0));
    let c = client(true, "2026-09-19T12:00:00Z", None, 0);
    assert_eq!(standing(&c, now), (Standing::Idle, 30));
    // Revoked wins over everything, however old.
    let c = client(false, "2025-01-01T00:00:00Z", None, 0);
    assert_eq!(standing(&c, now), (Standing::Revoked, 0));
}

#[test]
fn an_unreadable_moment_is_never_called_idle() {
    let now = at("2026-10-19T12:00:00Z");
    let c = client(true, "garbage", None, 0);
    assert_eq!(standing(&c, now), (Standing::New, 0));
}

#[test]
fn counts_are_exact_and_called_follows_uses() {
    let now = at("2026-10-19T12:00:00Z");
    let list = [
        client(
            true,
            "2026-10-01T00:00:00Z",
            Some("2026-10-18T00:00:00Z"),
            3,
        ),
        client(true, "2026-10-01T00:00:00Z", None, 0),
        client(
            true,
            "2026-01-01T00:00:00Z",
            Some("2026-02-01T00:00:00Z"),
            9,
        ),
        client(
            false,
            "2026-01-01T00:00:00Z",
            Some("2026-02-01T00:00:00Z"),
            2,
        ),
    ];
    let c = counts(list.iter().map(|v| (standing(v, now).0, v)));
    assert_eq!(
        c,
        Counts {
            all: 4,
            active: 3,
            in_use: 1,
            idle: 1,
            new: 1,
            revoked: 1,
            called: 3,
        }
    );
}

#[test]
fn dates_read_dd_mm_yyyy_hh_mm_in_brussels_summer_and_winter() {
    // Winter: UTC+1.
    assert_eq!(brussels("2026-01-15T23:30:00Z"), "16/01/2026 00:30");
    // Summer: UTC+2 (the example service's own capture of 2026-10-18).
    assert_eq!(brussels("2026-10-18T23:39:17Z"), "19/10/2026 01:39");
    // The switch: 2026-03-29 01:00 UTC and 2026-10-25 01:00 UTC.
    assert_eq!(brussels("2026-03-29T00:59:59Z"), "29/03/2026 01:59");
    assert_eq!(brussels("2026-03-29T01:00:00Z"), "29/03/2026 03:00");
    assert_eq!(brussels("2026-10-25T00:59:59Z"), "25/10/2026 02:59");
    assert_eq!(brussels("2026-10-25T01:00:00Z"), "25/10/2026 02:00");
    assert_eq!(brussels_date("2026-10-18T23:39:17Z"), "19/10/2026");
    // An offset in the input is honoured; nonsense is left alone.
    assert_eq!(brussels("2026-01-15T10:00:00+01:00"), "15/01/2026 10:00");
    assert_eq!(brussels("last week"), "last week");
}

#[test]
fn ago_is_exact_words() {
    let now = at("2026-10-19T12:00:00Z");
    assert_eq!(ago_words("2026-10-19T11:59:48Z", now), "12 s ago");
    assert_eq!(ago_words("2026-10-19T11:58:00Z", now), "2 min ago");
    assert_eq!(ago_words("2026-10-19T09:00:00Z", now), "3 h ago");
    assert_eq!(ago_words("2026-10-18T11:00:00Z", now), "1 day ago");
    assert_eq!(ago_words("2026-10-14T12:00:00Z", now), "5 days ago");
    assert_eq!(ago_words("2026-10-19T13:00:00Z", now), "0 s ago");
}
