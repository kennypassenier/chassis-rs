//! Tests of the section bodies, layout, problem and update facts and the
//! uptime history.

use super::problems::{command_in, plain_update_note};
use super::uptime::UPTIME_HOURS;
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
fn several_bodies_make_a_wide_card_unless_a_table_or_rows_are_among_them() {
    let both = Some(SectionBody::Many(vec![
        SectionBody::Kpis(vec![]),
        SectionBody::Checks(vec![]),
    ]));
    assert_eq!(kinds(&[both.clone(), narrow()]), [8, 4]);
    let with_table = Some(SectionBody::Many(vec![
        SectionBody::Kpis(vec![]),
        SectionBody::table(["a"], [vec!["1"]]),
    ]));
    assert_eq!(kinds(&[with_table, narrow()]), [12, 12]);
    let nested = SectionBody::Many(vec![
        SectionBody::Many(vec![SectionBody::Kpis(vec![])]),
        SectionBody::json("/x", JsonRender::Rows),
    ]);
    assert_eq!(nested.parts().len(), 1, "a Json among several is left out");
}

#[test]
fn a_table_column_sorts_as_numbers_only_when_every_cell_is_one() {
    let t = SectionBody::table(
        ["id", "from", "mixed"],
        [vec!["9", "a", "1"], vec!["10", "b", "x"]],
    );
    assert_eq!(t.column_sorts(), ["number", "text", "text"]);
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
