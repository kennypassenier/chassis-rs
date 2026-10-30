//! Signals, draining, restart persistence and an unwritable state directory: how
//! the service ends and what survives it.

use std::process::Command;
use std::time::{Duration, Instant};

use super::support::*;

// K5 / N1: SIGTERM ends the process with exit 0; a second SIGTERM
// changes nothing. K11: port 0 is honoured and the bound address is
// logged, which is how this test finds it.
#[test]
fn sigterm_exits_zero_and_second_signal_is_harmless() {
    let dir = tempfile::tempdir().unwrap();
    let (mut child, addr) = start(dir.path());
    let body = reqwest::blocking::get(format!("http://{addr}/healthz"))
        .unwrap()
        .text()
        .unwrap();
    assert!(body.contains("\"version\""), "{body}");

    let pid = child.0.id().to_string();
    assert!(
        Command::new("kill")
            .args(["-TERM", &pid])
            .status()
            .unwrap()
            .success()
    );
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
    let args: Vec<String> = [
        "drain-test",
        "--state-dir",
        dir.path().to_str().unwrap(),
        "--listen",
        "127.0.0.1:0",
        "--shutdown-timeout-ms",
        "5000",
        "--public-url",
        "https://inbox.example.lan",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    // S8: secrets are not flags; hand them in as the environment would.
    let env = std::collections::BTreeMap::from([
        ("DRAIN_TEST_TOKEN".to_string(), TOKEN.to_string()),
        ("DRAIN_TEST_SECRET_KEY".to_string(), KEY.to_string()),
    ]);
    let router = Router::new().route(
        "/slow",
        get(|| async {
            tokio::time::sleep(Duration::from_millis(400)).await;
            "done"
        }),
    );
    let app = App::from_args_with_env(spec, args, env, router).unwrap();
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

// H8 / K8 / critic #13: a session cookie and a client's usage counter
// survive SIGTERM + restart on the same state directory.
#[test]
fn sessions_and_usage_survive_a_restart() {
    let dir = tempfile::tempdir().unwrap();
    let (mut child, addr, _) = start_capturing(dir.path(), &[], &[]);
    let admin = login_jar(&addr);
    let (id, token) = issue_client(&admin, &addr, "survivor");
    let plain = reqwest::blocking::Client::new();
    for _ in 0..2 {
        assert_eq!(
            plain
                .post(format!("http://{addr}/v1/messages"))
                .bearer_auth(&token)
                .json(&serde_json::json!({"a": 1}))
                .send()
                .unwrap()
                .status()
                .as_u16(),
            202
        );
    }
    let res = admin
        .get(format!("http://{addr}/api/clients"))
        .send()
        .unwrap();
    assert_eq!(res.status().as_u16(), 200);
    stop(&mut child);

    let (mut child2, addr2, _) = start_capturing(dir.path(), &[], &[]);
    // Same host, new port: cookies are per host (not per port) in reqwest's jar.
    let res = admin
        .get(format!("http://{addr2}/api/clients"))
        .send()
        .unwrap();
    assert_eq!(
        res.status().as_u16(),
        200,
        "the session survived the restart"
    );
    let clients: serde_json::Value = res.json().unwrap();
    let c = clients
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == id)
        .expect("client persisted");
    assert_eq!(
        c["uses"], 2,
        "the usage counter was persisted at shutdown: {c}"
    );
    assert_eq!(
        plain
            .post(format!("http://{addr2}/v1/messages"))
            .bearer_auth(&token)
            .json(&serde_json::json!({"a": 2}))
            .send()
            .unwrap()
            .status()
            .as_u16(),
        202,
        "the token still works"
    );
    stop(&mut child2);
}

// H11 / rule 12: a state directory that exists but cannot be written is
// refused by --check and by start, with the chown remedy — not a 503 at
// the first login. (Skipped when running as root, where mode bits do not bind.)
#[test]
fn unwritable_state_dir_is_refused_at_check_and_start() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let ro = dir.path().join("ro");
    std::fs::create_dir(&ro).unwrap();
    std::fs::set_permissions(&ro, std::fs::Permissions::from_mode(0o555)).unwrap();
    if std::fs::write(ro.join("probe"), b"").is_ok() {
        return; // root
    }
    for args in [&["--check"][..], &[][..]] {
        let out = with_secrets(inbox())
            .args(args)
            .args(["--listen", "127.0.0.1:0"])
            .env("INBOX_STATE_DIR", &ro)
            .output()
            .unwrap();
        assert!(
            !out.status.success(),
            "{args:?} must refuse an unwritable state dir"
        );
        let stderr = String::from_utf8_lossy(&out.stderr);
        assert!(stderr.contains("not writable"), "{args:?}: {stderr}");
        assert!(stderr.contains("chown"), "{args:?}: {stderr}");
    }
    // A MISSING directory: --check refuses (it creates nothing), start creates it.
    let missing = dir.path().join("missing");
    let out = with_secrets(inbox())
        .args(["--check", "--listen", "127.0.0.1:0"])
        .env("INBOX_STATE_DIR", &missing)
        .output()
        .unwrap();
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("does not exist"));
    assert!(!missing.exists(), "--check created nothing");
    let (mut child, addr, _) = start_capturing(&missing, &[], &[]);
    assert!(missing.is_dir(), "start created the state root");
    reqwest::blocking::get(format!("http://{addr}/healthz")).unwrap();
    stop(&mut child);
    std::fs::set_permissions(&ro, std::fs::Permissions::from_mode(0o755)).unwrap();
}

// S4 / critic #20: --check says out loud when trusted_proxies is empty on a
// non-loopback listen, and when TimeoutStopSec would cut the drain short.
#[test]
fn check_warns_about_empty_trusted_proxies_and_a_short_stop_timeout() {
    let dir = tempfile::tempdir().unwrap();
    let out = with_secrets(inbox())
        .args([
            "--check",
            "--listen",
            "0.0.0.0:0",
            "--shutdown-timeout-ms",
            "20000",
        ])
        .env("INBOX_STATE_DIR", dir.path())
        .env("INBOX_TIMEOUT_STOP_SECS", "10")
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "warnings do not fail --check: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(
        stderr.contains("warning: trusted_proxies is empty"),
        "{stderr}"
    );
    assert!(stderr.contains("INBOX_TRUSTED_PROXIES"), "{stderr}");
    assert!(
        stderr.contains("TimeoutStopSec (10 s) is shorter"),
        "{stderr}"
    );
    // Loopback with a matching stop timeout: silent.
    let out = with_secrets(inbox())
        .args(["--check", "--listen", "127.0.0.1:0"])
        .env("INBOX_STATE_DIR", dir.path())
        .env("INBOX_TIMEOUT_STOP_SECS", "60")
        .output()
        .unwrap();
    assert!(out.status.success());
    assert!(!String::from_utf8_lossy(&out.stderr).contains("warning:"));
}
