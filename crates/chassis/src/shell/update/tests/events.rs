//! Tests of the events the updater reports: the failure threshold, an
//! unreachable host and the project hook.

use super::*;

/// K18 / Almanac's lesson: the loop's FIRST tick comes after the startup
/// delay, not after startup delay + interval; later ticks follow the
/// interval. Paused clock: hours pass in milliseconds.
/// A3 (1.4.0): the threshold table, exhaustively.
#[test]
fn failed_checks_are_reported_once_at_the_threshold_and_recovery_once() {
    assert_eq!(failure_transition(0, false, 3), (1, None));
    assert_eq!(failure_transition(1, false, 3), (2, None));
    assert_eq!(failure_transition(2, false, 3), (3, Some("update.failed")));
    assert_eq!(
        failure_transition(3, false, 3),
        (4, None),
        "said once, not every tick"
    );
    assert_eq!(
        failure_transition(4, true, 3),
        (0, Some("update.ok")),
        "recovery, once"
    );
    assert_eq!(
        failure_transition(1, true, 3),
        (0, None),
        "a short blip is silent"
    );
    assert_eq!(
        failure_transition(0, false, 1),
        (1, Some("update.failed")),
        "threshold 1 = the old behaviour"
    );
    assert_eq!(
        failure_transition(0, false, 0),
        (1, Some("update.failed")),
        "0 is clamped to 1"
    );
}

/// A3 (1.4.0): against an unreachable release host the updater says
/// `update.failed` exactly once, on the N-th failed check.
#[tokio::test]
async fn an_unreachable_host_is_reported_once_after_n_failed_checks() {
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), GOOD_BINARY);
    let release = fake_release("1.0.0", GOOD_BINARY, "svc").await;
    let mut c = cfg(&release, Mode::Autonomous, dir.path().join("c"));
    c.url = refused_url("/");
    c.notify_after_failures = 2;
    let events = Arc::new(std::sync::Mutex::new(Vec::new()));
    let sink_events = events.clone();
    let up = Updater::new(
        c,
        bin,
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        Arc::new(move |e: Event| sink_events.lock().unwrap().push(e.kind)),
        None,
    )
    .unwrap();
    for _ in 0..3 {
        assert!(up.check_once().await.is_err());
    }
    assert_eq!(
        *events.lock().unwrap(),
        vec!["update.failed"],
        "one event on the second failure, none on the first or third"
    );
}

/// 1.3.0: a project's `on_update_event` hook sees every event the kit
/// emits, and the kit's own handling still runs.
#[test]
fn the_project_hook_sees_every_event_and_the_kit_still_handles_it() {
    let seen_by_kit = Arc::new(std::sync::Mutex::new(Vec::new()));
    let seen_by_hook = Arc::new(std::sync::Mutex::new(Vec::new()));
    let kit = seen_by_kit.clone();
    let hook = seen_by_hook.clone();
    let sink = compose_sink(
        Arc::new(move |e: Event| kit.lock().unwrap().push(e.kind)),
        Some(Arc::new(move |e: &Event| {
            hook.lock()
                .unwrap()
                .push(format!("{} {} {}", e.kind, e.version, e.detail))
        })),
    );
    for (kind, version) in [
        ("update.installed", "1.2.0"),
        ("update.rolled_back", "1.2.0"),
        ("update.held", "1.2.0"),
    ] {
        sink(Event {
            kind,
            version: version.to_string(),
            detail: "test".to_string(),
        });
    }
    assert_eq!(
        *seen_by_kit.lock().unwrap(),
        vec!["update.installed", "update.rolled_back", "update.held"]
    );
    assert_eq!(
        *seen_by_hook.lock().unwrap(),
        vec![
            "update.installed 1.2.0 test",
            "update.rolled_back 1.2.0 test",
            "update.held 1.2.0 test"
        ]
    );
    // Without a hook the kit's handling is untouched.
    let only_kit = compose_sink(Arc::new(|_| {}), None);
    only_kit(Event {
        kind: "update.ok",
        version: "1.0.0".to_string(),
        detail: String::new(),
    });
}
