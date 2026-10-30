//! Logs and notifications: no secret in the log, one access line per request,
//! JSON mode, and the webhook that hears kit and project events.

use std::time::{Duration, Instant};

use super::support::*;

// H4 / K3 / K4 / W1: the whole flow runs, then the log is read: no secret in
// any line, one access line per request, every access line with a request
// id, and the request id we sent comes back as ours.
#[test]
fn the_log_never_carries_a_secret_and_counts_one_access_line_per_request() {
    let dir = tempfile::tempdir().unwrap();
    let (mut child, addr, lines) = start_capturing(dir.path(), &[], &[]);
    let admin = login_jar(&addr);
    let (_id, token) = issue_client(&admin, &addr, "log-scan");
    let plain = reqwest::blocking::Client::new();
    for i in 0..3 {
        let res = plain
            .post(format!("http://{addr}/v1/messages"))
            .bearer_auth(&token)
            .header("x-request-id", format!("scan-{i}"))
            .json(&serde_json::json!({"n": i}))
            .send()
            .unwrap();
        assert_eq!(res.status().as_u16(), 202);
        assert_eq!(
            res.headers()["x-request-id"].to_str().unwrap(),
            format!("scan-{i}"),
            "a well-formed caller id is echoed (W1)"
        );
    }
    // A malformed request id is replaced, never echoed into the log.
    let res = plain
        .get(format!("http://{addr}/healthz"))
        .header("x-request-id", "evil id with spaces $(rm -rf)")
        .send()
        .unwrap();
    assert_ne!(
        res.headers()["x-request-id"].to_str().unwrap(),
        "evil id with spaces $(rm -rf)"
    );
    // A wrong login attempt: the presented token must not be logged either.
    let bad = "not-the-real-token-value-xyz";
    plain
        .post(format!("http://{addr}/login"))
        .form(&[("token", bad)])
        .send()
        .unwrap();
    stop(&mut child);

    let log = lines.lock().unwrap().clone();
    let joined = log.join("\n");
    for secret in [TOKEN, KEY, token.as_str(), bad] {
        assert!(
            !joined.contains(secret),
            "secret {secret:?} appeared in the log:\n{joined}"
        );
    }
    assert!(
        !joined.contains("evil id"),
        "a rejected request id never reaches the log"
    );
    let access: Vec<&String> = log
        .iter()
        .filter(|l| l.contains(" request method="))
        .collect();
    // login, POST /api/clients, GET token, 3× POST, GET /healthz, bad login = 8 requests
    assert_eq!(
        access.len(),
        8,
        "one access line per request:\n{}",
        access
            .iter()
            .map(|s| s.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    );
    for line in &access {
        assert!(line.contains("request_id="), "{line}");
    }
    assert!(
        access.iter().any(|l| l.contains("request_id=scan-1")),
        "our id is in its access line"
    );
}

// K4: JSON mode — every line is one JSON object with the access fields.
#[test]
fn json_log_mode_emits_one_object_per_line() {
    let dir = tempfile::tempdir().unwrap();
    let (mut child, addr, lines) = start_capturing(dir.path(), &["--log-format", "json"], &[]);
    reqwest::blocking::get(format!("http://{addr}/healthz")).unwrap();
    stop(&mut child);
    let log = lines.lock().unwrap().clone();
    assert!(log.len() >= 3, "{log:?}");
    let mut saw_access = false;
    for line in &log {
        let v: serde_json::Value =
            serde_json::from_str(line).unwrap_or_else(|e| panic!("not JSON: {e}: {line}"));
        assert!(
            v.get("level").is_some() && v.get("fields").is_some(),
            "{line}"
        );
        if v["fields"]["message"] == "request" {
            saw_access = true;
            assert_eq!(v["fields"]["path"], "/healthz");
            assert!(v["fields"]["request_id"].is_string());
        }
    }
    assert!(saw_access, "an access record in JSON:\n{}", log.join("\n"));
}

// H6 / K22 / K26: inbox with a [[notify.webhook]] delivers service.started
// and message.received to a receiver, with the `${VAR}` header — and that
// header's value never appears in the log.
#[test]
fn notify_webhook_receives_kit_and_project_events_and_the_header_stays_out_of_the_log() {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let sink = seen.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let mut stream = stream;
            let mut buf = vec![0u8; 65536];
            let mut total = 0;
            // Read until the body announced by Content-Length is complete.
            loop {
                let n = stream.read(&mut buf[total..]).unwrap_or(0);
                if n == 0 {
                    break;
                }
                total += n;
                let text = String::from_utf8_lossy(&buf[..total]).into_owned();
                if let Some((head, body)) = text.split_once("\r\n\r\n") {
                    let len: usize = head
                        .lines()
                        .find_map(|l| {
                            l.strip_prefix("Content-Length: ")
                                .or_else(|| l.strip_prefix("content-length: "))
                        })
                        .and_then(|v| v.trim().parse().ok())
                        .unwrap_or(0);
                    if body.len() >= len {
                        break;
                    }
                }
            }
            let text = String::from_utf8_lossy(&buf[..total]).into_owned();
            sink.lock().unwrap().push(text);
            let _ = stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        }
    });

    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("config.toml"),
        format!(
            r#"[[notify.webhook]]
events = ["service.started", "message.received"]
url = "http://{addr}/hook/${{INBOX_HOOK_SECRET}}"
headers = {{ "X-Hook" = "${{INBOX_HOOK_SECRET}}" }}
"#
        ),
    )
    .unwrap();
    let hook_secret = "hook-secret-value-7f3a9c1e";
    let (mut child, saddr, lines) =
        start_capturing(dir.path(), &[], &[("INBOX_HOOK_SECRET", hook_secret)]);
    let admin = login_jar(&saddr);
    let (_id, token) = issue_client(&admin, &saddr, "notifier");
    reqwest::blocking::Client::new()
        .post(format!("http://{saddr}/v1/messages"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"hello": "hook"}))
        .send()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline && seen.lock().unwrap().len() < 2 {
        std::thread::sleep(Duration::from_millis(50));
    }
    stop(&mut child);
    let got = seen.lock().unwrap().clone();
    assert!(
        got.len() >= 2,
        "expected two deliveries, got {}:\n{}",
        got.len(),
        got.join("\n---\n")
    );
    let all = got.join("\n");
    assert!(all.contains("service.started"), "{all}");
    assert!(all.contains("message.received"), "{all}");
    assert!(
        all.contains(&format!("X-Hook: {hook_secret}"))
            || all.contains(&format!("x-hook: {hook_secret}")),
        "the expanded header reached the receiver:\n{all}"
    );
    assert!(
        all.contains(&format!("/hook/{hook_secret}")),
        "the expanded URL path reached the receiver"
    );
    let log = lines.lock().unwrap().join("\n");
    assert!(
        !log.contains(hook_secret),
        "the ${{VAR}} value must never be logged:\n{log}"
    );
}
