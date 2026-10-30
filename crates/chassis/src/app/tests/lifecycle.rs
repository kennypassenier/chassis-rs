//! Tests of a real start and stop: kit routes, hooks, degraded health, the
//! body cap.

use super::*;

/// 1.1.0: `on_start` runs once, after the bind, on the serving path
/// only — never for `--check`.
#[tokio::test]
async fn on_start_runs_once_after_bind_and_not_for_check() {
    let _gate = crate::shell::backup::TEST_GATE.read().await;
    let dir = tempfile::tempdir().unwrap();
    let ran = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let r2 = ran.clone();
    let mut app = from_args_secret(spec(), argv(&secrets_env(dir.path())), Router::new()).unwrap();
    app.on_start(move || {
        r2.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    });
    assert_eq!(
        ran.load(std::sync::atomic::Ordering::SeqCst),
        0,
        "not before start"
    );
    let running = app.start().await.unwrap();
    assert_eq!(
        ran.load(std::sync::atomic::Ordering::SeqCst),
        1,
        "exactly once after the bind"
    );
    running.stop().await;
    assert_eq!(ran.load(std::sync::atomic::Ordering::SeqCst), 1);

    let mut args = secrets_env(dir.path());
    args.push("--check");
    let r3 = ran.clone();
    let mut check = from_args_secret(spec(), argv(&args), Router::new()).unwrap();
    check.on_start(move || {
        r3.fetch_add(10, std::sync::atomic::Ordering::SeqCst);
    });
    assert!(
        check.control().await.unwrap().is_some(),
        "--check is a control command"
    );
    assert_eq!(
        ran.load(std::sync::atomic::Ordering::SeqCst),
        1,
        "--check never starts workers"
    );
}

#[tokio::test]
async fn start_serves_kit_routes_and_stops_cleanly() {
    let _gate = crate::shell::backup::TEST_GATE.read().await;
    let dir = tempfile::tempdir().unwrap();
    let mut app = from_args_secret(
        spec(),
        argv(&secrets_env(dir.path())),
        // `/` belongs to the kit's status page when the dashboard is compiled in.
        Router::new().route("/hello", get(|| async { "hi" })),
    )
    .unwrap();
    assert!(app.control.is_none());
    let flushed = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let f2 = flushed.clone();
    app.on_flush(move || f2.store(true, std::sync::atomic::Ordering::SeqCst));
    app.subsystem(Store(true)).metrics_source(Scraper);
    let running = app.start().await.unwrap();
    assert_ne!(running.addr.port(), 0);
    let base = format!("http://{}", running.addr);

    let body = reqwest::get(format!("{base}/hello"))
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert_eq!(body, "hi");

    // K6: /healthz carries the version and the subsystem.
    let res = reqwest::get(format!("{base}/healthz")).await.unwrap();
    assert_eq!(res.status(), 200);
    let v: serde_json::Value = res.json().await.unwrap();
    assert_eq!(v["version"], "9.8.7");
    assert_eq!(v["status"], "ok");
    assert_eq!(v["subsystems"]["store"]["detail"], "writable");

    // K7: /metrics has the kit baseline, the counted requests and the verbatim source.
    let text = reqwest::get(format!("{base}/metrics"))
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert!(
        text.contains("t_app_build_info{version=\"9.8.7\"} 1"),
        "{text}"
    );
    assert!(
        text.contains("t_app_http_requests_total{route=\"/healthz\",status=\"200\"}"),
        "{text}"
    );
    assert!(text.contains("project_things_total 7"), "{text}");

    // --healthcheck against the running instance: alive.
    let probe = health::probe(&format!("{base}/healthz"), Duration::from_secs(2))
        .await
        .unwrap();
    assert!(probe.alive);

    running.stop().await;
    assert!(
        flushed.load(std::sync::atomic::Ordering::SeqCst),
        "flush hook ran after drain"
    );
}

#[tokio::test]
async fn degraded_subsystem_gives_503_but_probe_still_says_alive() {
    let _gate = crate::shell::backup::TEST_GATE.read().await;
    let dir = tempfile::tempdir().unwrap();
    let mut app = from_args_secret(spec(), argv(&secrets_env(dir.path())), Router::new()).unwrap();
    app.subsystem(Store(false));
    let running = app.start().await.unwrap();
    let url = format!("http://{}/healthz", running.addr);
    let res = reqwest::get(&url).await.unwrap();
    assert_eq!(res.status(), 503);
    // Critic #3: liveness is a different question from health.
    let probe = health::probe(&url, Duration::from_secs(2)).await.unwrap();
    assert!(probe.alive);
    assert_eq!(probe.status, "degraded");
    running.stop().await;
}

#[tokio::test]
async fn body_cap_answers_413() {
    let _gate = crate::shell::backup::TEST_GATE.read().await;
    let dir = tempfile::tempdir().unwrap();
    let mut args = secrets_env(dir.path());
    args.extend(["--max-body-bytes", "16"]);
    let app = from_args_secret(
        spec(),
        argv(&args),
        Router::new().route(
            "/in",
            axum::routing::post(|body: String| async move { body }),
        ),
    )
    .unwrap();
    let running = app.start().await.unwrap();
    let client = reqwest::Client::new();
    let res = client
        .post(format!("http://{}/in", running.addr))
        .body("x".repeat(64))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 413);
    let res = client
        .post(format!("http://{}/in", running.addr))
        .body("short")
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    running.stop().await;
}
