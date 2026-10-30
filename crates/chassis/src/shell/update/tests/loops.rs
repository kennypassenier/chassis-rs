//! Tests of the scheduling loops: the update gate, the autonomous loop
//! and the read-only watch.

use super::*;

/// Waits up to 10 s of wall time for the fake release to see `n` checks.
async fn wait_for_hits(hits: &std::sync::atomic::AtomicUsize, n: usize) {
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    while hits.load(Ordering::SeqCst) < n && std::time::Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
}

/// 1.2.0: a project's gate defers a check to the next interval instead of
/// restarting under an investigation (Almanac's captures, AR25).
#[tokio::test]
async fn the_update_gate_defers_a_check_until_it_opens() {
    let release = fake_release("1.0.0", GOOD_BINARY, "svc").await;
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), GOOD_BINARY);
    let mut c = cfg(&release, Mode::Autonomous, dir.path().join("c"));
    c.startup_delay = Duration::from_secs(0);
    c.interval = Duration::from_millis(300);
    let open = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let gate_open = open.clone();
    c.gate = Some(Arc::new(move || {
        (!gate_open.load(Ordering::SeqCst)).then(|| "2 captures retained".to_string())
    }));
    let up = Arc::new(
        Updater::new(
            c,
            bin,
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            Arc::new(|_| {}),
            None,
        )
        .unwrap(),
    );
    let hits = release.version_hits.clone();
    let handle = tokio::spawn(up.clone().run_autonomous());
    // Two closed ticks: at the start and one interval later.
    tokio::time::sleep(Duration::from_millis(450)).await;
    assert_eq!(
        hits.load(Ordering::SeqCst),
        0,
        "closed gate: no check at all"
    );
    open.store(true, Ordering::SeqCst);
    wait_for_hits(&hits, 1).await;
    assert_eq!(
        hits.load(Ordering::SeqCst),
        1,
        "open gate: the next tick checks"
    );
    handle.abort();
}

// The two loop tests below run on the real clock with short durations.
// They used paused time, but a check is real socket IO: whenever the
// runtime idled waiting on loopback, tokio auto-advanced the paused clock
// to the request's 5 s timeout and the check failed. On WSL2 that
// happened on every run; elsewhere only under load. Only lower bounds are
// asserted on time, so a slow machine can delay a check but not fail it.
#[tokio::test]
async fn autonomous_loop_ticks_after_the_startup_delay_then_every_interval() {
    let release = fake_release("1.0.0", GOOD_BINARY, "svc").await;
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), GOOD_BINARY);
    let mut c = cfg(&release, Mode::Autonomous, dir.path().join("c"));
    let (delay, interval) = (Duration::from_millis(400), Duration::from_millis(600));
    c.startup_delay = delay;
    c.interval = interval;
    let up = Arc::new(
        Updater::new(
            c,
            bin,
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            Arc::new(|_| {}),
            None,
        )
        .unwrap(),
    );
    let hits = release.version_hits.clone();
    let start = std::time::Instant::now();
    let handle = tokio::spawn(up.clone().run_autonomous());
    tokio::time::sleep(delay / 2).await;
    assert_eq!(
        hits.load(Ordering::SeqCst),
        0,
        "no check before the startup delay"
    );
    wait_for_hits(&hits, 1).await;
    assert_eq!(
        hits.load(Ordering::SeqCst),
        1,
        "first check after the startup delay"
    );
    assert!(
        start.elapsed() >= delay,
        "first check came before the delay"
    );
    wait_for_hits(&hits, 2).await;
    assert_eq!(
        hits.load(Ordering::SeqCst),
        2,
        "second check one interval later"
    );
    assert!(
        start.elapsed() >= delay + interval,
        "second check came before delay + interval"
    );
    assert!(up.last_check().at.is_some());
    handle.abort();
}

/// K20: in `off` and `supervised` the card still learns about a newer
/// release, read-only.
#[tokio::test]
async fn watch_once_reports_a_newer_release_without_installing() {
    let release = fake_release("2.0.0", GOOD_BINARY, "svc").await;
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), GOOD_BINARY);
    let up = Updater::new(
        cfg(&release, Mode::Off, dir.path().join("c")),
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        Arc::new(|_| {}),
        None,
    )
    .unwrap();
    let latest = up.watch_once().await.unwrap();
    assert_eq!(latest, Version::parse("2.0.0").unwrap());
    let last = up.last_check();
    assert_eq!(last.latest.as_deref(), Some("2.0.0"));
    assert!(
        last.outcome
            .as_deref()
            .unwrap_or("")
            .starts_with("newer available"),
        "{:?}",
        last.outcome
    );
    assert_eq!(
        std::fs::read(&bin).unwrap(),
        GOOD_BINARY,
        "nothing installed"
    );
    assert!(!with_suffix(&bin, ".staging").exists());
}
