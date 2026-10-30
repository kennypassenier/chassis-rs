//! Tests of the backup pause gate and the controller. The command-line side
//! has its own module, `command_line`.

use super::*;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

mod command_line;

// The gate is process-wide, so these tests take turns.
static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn controller() -> Controller {
    Controller::new(Vec::new(), Vec::new())
}

const MIN: Duration = Duration::from_secs(60);

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_pause_waits_for_the_write_in_flight_and_holds_new_ones() {
    let _serial = SERIAL.lock().await;
    let c = controller();
    let ticket = writing().await;
    let pausing = tokio::spawn({
        let c = c.clone();
        async move { c.pause(MIN, Mode::Writes).await }
    });
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert!(!pausing.is_finished(), "the pause must wait for the ticket");
    drop(ticket);
    assert_eq!(pausing.await.unwrap().unwrap().1, Mode::Writes);
    assert!(is_paused());
    assert!(!is_fully_paused());

    let writer = tokio::spawn(async { writing().await });
    let blocking = tokio::task::spawn_blocking(writing_blocking);
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert!(!writer.is_finished(), "an async write waits while paused");
    assert!(
        !blocking.is_finished(),
        "a blocking write waits while paused"
    );
    assert!(c.resume("test").await);
    drop(writer.await.unwrap());
    drop(blocking.await.unwrap());
    assert!(!c.resume("test").await, "nothing left to resume");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_service_raises_the_mode_and_a_caller_can_raise_it_never_lower() {
    let _serial = SERIAL.lock().await;
    let modes = Arc::new(Mutex::new(Vec::new()));
    let seen = modes.clone();
    let hook: PauseHook = Arc::new(move |m| {
        seen.lock().unwrap().push(m);
        Ok(())
    });
    // A service that declares Full gets Full even when Writes is asked.
    let full = Controller::new(vec![hook.clone()], Vec::new()).with_mode(Mode::Full);
    assert_eq!(full.pause(MIN, Mode::Writes).await.unwrap().1, Mode::Full);
    assert!(is_fully_paused());
    full.resume("test").await;
    // A writes-only pause raised to full while in force runs the hooks
    // again with Full; asking Writes afterwards does not lower it.
    let c = Controller::new(vec![hook], Vec::new());
    assert_eq!(c.pause(MIN, Mode::Writes).await.unwrap().1, Mode::Writes);
    assert_eq!(c.pause(MIN, Mode::Full).await.unwrap().1, Mode::Full);
    assert_eq!(c.pause(MIN, Mode::Writes).await.unwrap().1, Mode::Full);
    assert_eq!(c.status().unwrap().1, Mode::Full);
    c.resume("test").await;
    assert!(!is_fully_paused());
    assert_eq!(
        *modes.lock().unwrap(),
        vec![Mode::Full, Mode::Writes, Mode::Full]
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_full_pause_answers_503_except_the_probes() {
    use tower::ServiceExt;
    let _serial = SERIAL.lock().await;
    let r = full_pause_layer(
        axum::Router::new()
            .route("/healthz", axum::routing::get(|| async { "alive" }))
            .route("/api/x", axum::routing::get(|| async { "x" })),
    );
    let get = |p: &'static str| {
        let r = r.clone();
        async move {
            r.oneshot(
                axum::http::Request::get(p)
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
        }
    };
    let c = controller();
    c.pause(MIN, Mode::Writes).await.unwrap();
    assert_eq!(
        get("/api/x").await.status(),
        200,
        "writes-only pause serves"
    );
    c.pause(MIN, Mode::Full).await.unwrap();
    let held = get("/api/x").await;
    assert_eq!(held.status(), 503);
    assert!(held.headers().contains_key("retry-after"));
    assert_eq!(get("/healthz").await.status(), 200, "probes still answer");
    c.resume("test").await;
    assert_eq!(get("/api/x").await.status(), 200);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_repeated_pause_is_a_heartbeat_that_moves_the_deadline() {
    // The homelab's way (2026-10-01): `backup-pause --for 120`, again
    // every 60 s while the copy runs, then `backup-resume`. Here in
    // seconds: each repeat answers Ok and pushes the deadline out, and
    // when the repeats stop the pause ends by itself.
    let _serial = SERIAL.lock().await;
    let c = controller();
    let beat = Duration::from_secs(2);
    let (first, _) = c.pause(beat, Mode::Writes).await.unwrap();
    for _ in 0..3 {
        tokio::time::sleep(Duration::from_millis(1200)).await;
        let (until, _) = c.pause(beat, Mode::Writes).await.expect("a repeat is Ok");
        assert!(is_paused(), "still paused past the first deadline");
        assert!(until >= first, "the deadline only moves out");
    }
    // 3.6 s in: past the first 2 s deadline, held by the heartbeat.
    assert!(c.status().is_some());
    tokio::time::sleep(Duration::from_millis(2600)).await;
    assert!(!is_paused(), "no heartbeat, so the dead-man ended it");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_write_that_never_ends_refuses_the_pause_and_releases_the_gate() {
    let _serial = SERIAL.lock().await;
    let mut c = controller();
    c.drain = Duration::from_millis(200);
    let ticket = writing().await;
    match c.pause(MIN, Mode::Writes).await {
        // Other tests in this binary may be writing too.
        Err(PauseError::Busy(n)) => assert!(n >= 1),
        other => panic!("expected Busy, got {other:?}"),
    }
    assert!(!is_paused());
    drop(writing().await); // not held: the refusal let go
    drop(ticket);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_deadline_ends_a_pause_nobody_resumed() {
    let _serial = SERIAL.lock().await;
    let c = controller();
    c.pause(Duration::from_secs(1), Mode::Full).await.unwrap();
    assert!(c.status().is_some());
    tokio::time::sleep(Duration::from_millis(1500)).await;
    assert!(!is_paused(), "the dead-man ended it");
    assert!(!is_fully_paused());
    assert_eq!(c.status(), None);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_failing_pause_hook_refuses_the_pause() {
    let _serial = SERIAL.lock().await;
    let resumed = Arc::new(AtomicBool::new(false));
    let r = resumed.clone();
    let c = Controller::new(
        vec![Arc::new(|_| {
            Err(Error::internal("checkpoint failed", "retry"))
        })],
        vec![Arc::new(move || r.store(true, Ordering::SeqCst))],
    );
    match c.pause(MIN, Mode::Writes).await {
        Err(PauseError::Hook(e)) => assert!(e.contains("checkpoint failed"), "{e}"),
        other => panic!("expected Hook, got {other:?}"),
    }
    assert!(!is_paused());
    assert!(resumed.load(Ordering::SeqCst));
}
