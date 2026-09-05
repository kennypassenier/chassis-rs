//! E2E tests against the real `inbox` binary (K2, K5, K11, AR15, AR20)
//! and one in-process drain test (K5). These drive what a unit test
//! cannot: the process boundary, signals, exit codes and stderr.

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Kills the child when the test panics, so a failed assertion never
/// leaves an `inbox` process holding the test runner's pipes open (which
/// is exactly how this test hung the first time it failed).
struct Reaper(std::process::Child);

impl Drop for Reaper {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn inbox() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_inbox"));
    // A clean environment: the binary must not depend on anything the
    // test runner happens to have set.
    c.env_clear();
    c.env("PATH", std::env::var("PATH").unwrap_or_default());
    c
}

// AR20 / K2: --version reads nothing. No state dir exists, LISTEN is
// garbage, and it still answers.
#[test]
fn version_answers_with_no_configuration_at_all() {
    let out = inbox()
        .args(["--version"])
        .env("INBOX_LISTEN", "garbage")
        .env("INBOX_STATE_DIR", "/nonexistent/for/sure")
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8(out.stdout).unwrap();
    assert!(stdout.starts_with("inbox 0."), "{stdout}");
}

// K2: --print-config shows every knob with its source, and --check exits
// 0 on a valid configuration without opening a socket (the state dir is
// empty and stays empty).
#[test]
fn print_config_and_check_touch_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let out = inbox()
        .args(["--print-config", "--listen", "127.0.0.1:1"])
        .env("INBOX_STATE_DIR", dir.path())
        .env("INBOX_LOG", "debug")
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8(out.stdout).unwrap();
    assert!(
        stdout.contains("listen") && stdout.contains("(flag)"),
        "{stdout}"
    );
    assert!(
        stdout.contains("log") && stdout.contains("(env)"),
        "{stdout}"
    );
    assert!(
        stdout.contains("shutdown_timeout_ms") && stdout.contains("(default)"),
        "{stdout}"
    );

    let out = inbox()
        .args(["--check", "--listen", "127.0.0.1:1"])
        .env("INBOX_STATE_DIR", dir.path())
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert_eq!(
        std::fs::read_dir(dir.path()).unwrap().count(),
        0,
        "--check wrote into the state dir"
    );

    let out = inbox()
        .args(["--check", "--listen", "not-an-address"])
        .env("INBOX_STATE_DIR", dir.path())
        .output()
        .unwrap();
    assert!(!out.status.success());
    let stderr = String::from_utf8(out.stderr).unwrap();
    assert!(
        stderr.contains("What now:"),
        "every error carries a remedy: {stderr}"
    );
}

// K5 / N1: SIGTERM ends the process with exit 0; a second SIGTERM
// changes nothing. K11: port 0 is honoured and the bound address is
// logged, which is how this test finds it.
#[test]
fn sigterm_exits_zero_and_second_signal_is_harmless() {
    let dir = tempfile::tempdir().unwrap();
    let mut child = Reaper(
        inbox()
            .args(["--listen", "127.0.0.1:0", "--shutdown-timeout-ms", "5000"])
            .env("INBOX_STATE_DIR", dir.path())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let stderr = child.0.stderr.take().unwrap();
    let mut lines = BufReader::new(stderr).lines();
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut addr = None;
    while Instant::now() < deadline {
        let Some(Ok(line)) = lines.next() else { break };
        if line.contains("listening") {
            // `addr=127.0.0.1:PORT` in the text log.
            addr = line
                .split_whitespace()
                .find_map(|w| w.strip_prefix("addr=").map(|a| a.to_string()));
            break;
        }
    }
    let addr = addr.expect("no 'listening' line with addr= within 10 s");
    assert!(
        !addr.ends_with(":0"),
        "port 0 must be replaced by the real port: {addr}"
    );

    // The service answers before we stop it.
    let body = reqwest::blocking::get(format!("http://{addr}/"))
        .unwrap()
        .text()
        .unwrap();
    assert!(body.contains("inbox"));

    let pid = child.0.id().to_string();
    assert!(
        Command::new("kill")
            .args(["-TERM", &pid])
            .status()
            .unwrap()
            .success()
    );
    // Second signal while shutting down: must not change the outcome.
    let _ = Command::new("kill").args(["-TERM", &pid]).status();

    let status = child.0.wait().unwrap();
    assert_eq!(status.code(), Some(0), "N1: a graceful stop exits 0");
}

// K5: a request in flight when the stop arrives is answered, not cut.
#[tokio::test]
async fn in_flight_request_completes_during_drain() {
    use axum::Router;
    use axum::routing::get;
    use chassis::{App, AppSpec};

    let dir = tempfile::tempdir().unwrap();
    let spec = AppSpec {
        name: "drain-test",
        version: "0.0.1",
        ..Default::default()
    };
    let args = vec![
        "drain-test".to_string(),
        "--state-dir".to_string(),
        dir.path().display().to_string(),
        "--listen".to_string(),
        "127.0.0.1:0".to_string(),
        "--shutdown-timeout-ms".to_string(),
        "5000".to_string(),
    ];
    let router = Router::new().route(
        "/slow",
        get(|| async {
            tokio::time::sleep(Duration::from_millis(400)).await;
            "done"
        }),
    );
    let app = App::from_args(spec, args, router).unwrap();
    let running = app.start().await.unwrap();
    let url = format!("http://{}/slow", running.addr);
    let request =
        tokio::spawn(async move { reqwest::get(url).await.unwrap().text().await.unwrap() });
    tokio::time::sleep(Duration::from_millis(100)).await;
    let started = Instant::now();
    running.stop().await;
    let body = request.await.unwrap();
    assert_eq!(body, "done", "the in-flight request was answered, not cut");
    assert!(
        started.elapsed() >= Duration::from_millis(250),
        "stop waited for the drain"
    );
}
