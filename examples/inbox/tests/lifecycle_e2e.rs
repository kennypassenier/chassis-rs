//! E2E tests against the real `inbox` binary (K2, K5, K8, K11, K12, K13,
//! AR15, AR20) and one in-process drain test (K5). These drive what a
//! unit test cannot: the process boundary, signals, exit codes, stderr,
//! and the full client-token flow over HTTP.

use sha2::Digest;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const TOKEN: &str = "a-login-token-that-is-long-enough";
const KEY: &str = "abababababababababababababababababababababababababababababababab";

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

fn with_secrets(mut c: Command) -> Command {
    c.env("INBOX_TOKEN", TOKEN)
        .env("INBOX_SECRET_KEY", KEY)
        // Only read when the passkeys feature is compiled in (K9).
        .env("INBOX_PUBLIC_URL", "https://inbox.example.lan");
    c
}

/// Start the binary on port 0 and return the child plus its address,
/// read from the `listening` log line.
fn start(dir: &std::path::Path) -> (Reaper, String) {
    let mut child = Reaper(
        with_secrets(inbox())
            .args(["--listen", "127.0.0.1:0", "--shutdown-timeout-ms", "5000"])
            .env("INBOX_STATE_DIR", dir)
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
            addr = line
                .split_whitespace()
                .find_map(|w| w.strip_prefix("addr=").map(|a| a.to_string()));
            break;
        }
    }
    // Keep draining stderr so the child never blocks on a full pipe.
    std::thread::spawn(move || for _ in lines {});
    let addr = addr.expect("no 'listening' line with addr= within 10 s");
    assert!(
        !addr.ends_with(":0"),
        "port 0 must be replaced by the real port: {addr}"
    );
    (child, addr)
}

// AR20 / K2: --version reads nothing. No state dir exists, LISTEN is
// garbage, no secrets, and it still answers.
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

// K2: --print-config shows every knob with its source and masks secrets;
// --check exits 0 on a valid configuration without touching the state dir.
#[test]
fn print_config_and_check_touch_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let out = with_secrets(inbox())
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
    assert!(
        !stdout.contains(TOKEN) && !stdout.contains(KEY),
        "secrets are masked: {stdout}"
    );
    assert!(
        stdout.contains("secret_key") && stdout.contains("***"),
        "{stdout}"
    );

    let out = with_secrets(inbox())
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

    let out = with_secrets(inbox())
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

// K8 / W6: with the dashboard compiled in, no secrets means no start and
// no green --check; the remedy names gen-secret and never a value.
#[test]
fn without_secrets_the_service_refuses_with_gen_secret_remedy() {
    let dir = tempfile::tempdir().unwrap();
    for args in [vec!["--check"], vec![]] {
        let out = inbox()
            .args(&args)
            .args(["--listen", "127.0.0.1:0"])
            .env("INBOX_STATE_DIR", dir.path())
            .output()
            .unwrap();
        assert!(!out.status.success(), "args {args:?}");
        let stderr = String::from_utf8(out.stderr).unwrap();
        assert!(stderr.contains("gen-secret"), "{stderr}");
    }
    // Half-configured is refused too.
    let out = inbox()
        .args(["--check", "--listen", "127.0.0.1:0"])
        .env("INBOX_STATE_DIR", dir.path())
        .env("INBOX_TOKEN", TOKEN)
        .output()
        .unwrap();
    assert!(!out.status.success());
    assert!(
        String::from_utf8(out.stderr)
            .unwrap()
            .contains("INBOX_SECRET_KEY is not")
    );
}

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

// K8 + K12 + K13 + K14 over the wire: log in, issue a client, use its
// token, see the capture, reveal, revoke, and be refused afterwards.
#[test]
fn client_token_flow_end_to_end() {
    let dir = tempfile::tempdir().unwrap();
    let (_child, addr) = start(dir.path());
    let base = format!("http://{addr}");
    let http = reqwest::blocking::Client::builder()
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();

    // A browser without a session is sent to /login; a wrong token is a 200 with a message.
    let res = http.get(format!("{base}/api/clients")).send().unwrap();
    assert_eq!(res.status(), 303, "redirect to /login, not a 401 popup");
    let res = http
        .post(format!("{base}/login"))
        .form(&[("token", "wrong")])
        .send()
        .unwrap();
    assert_eq!(res.status(), 200);
    assert!(res.text().unwrap().contains("not right"));

    // Log in; the cookie is HttpOnly and named after the service.
    let res = http
        .post(format!("{base}/login"))
        .form(&[("token", TOKEN)])
        .send()
        .unwrap();
    assert_eq!(res.status(), 303);
    let set_cookie = res
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(set_cookie.starts_with("inbox_session="), "{set_cookie}");
    assert!(
        set_cookie.contains("HttpOnly") && set_cookie.contains("SameSite=Lax"),
        "{set_cookie}"
    );
    assert!(
        !set_cookie.contains("Secure"),
        "plain HTTP without a trusted proxy is not Secure"
    );

    // Issue a client; the list never shows the token.
    let res = http
        .post(format!("{base}/api/clients"))
        .json(&serde_json::json!({ "name": "home-assistant" }))
        .send()
        .unwrap();
    assert_eq!(res.status(), 201);
    let client: serde_json::Value = res.json().unwrap();
    let id = client["id"].as_str().unwrap().to_string();
    let list = http
        .get(format!("{base}/api/clients"))
        .send()
        .unwrap()
        .text()
        .unwrap();
    assert!(
        list.contains("home-assistant") && !list.contains("\"token\""),
        "{list}"
    );

    // Reveal the token (K12) and use it (K13 counts it, the capture redacts it).
    let reveal: serde_json::Value = http
        .get(format!("{base}/api/clients/{id}/token"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    let token = reveal["token"].as_str().unwrap().to_string();
    assert_eq!(token.len(), 64);
    assert!(reveal["command"].as_str().unwrap().contains("/v1/messages"));

    let anon = reqwest::blocking::Client::new();
    let res = anon
        .post(format!("{base}/v1/messages"))
        .json(&serde_json::json!({"x": 1}))
        .send()
        .unwrap();
    assert_eq!(res.status(), 401, "no token → JSON 401");
    let res = anon
        .post(format!("{base}/v1/messages"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"temperature": 21.5}))
        .send()
        .unwrap();
    assert_eq!(res.status(), 202);
    let accepted: serde_json::Value = res.json().unwrap();
    assert_eq!(accepted["from"], "home-assistant");

    let caps: serde_json::Value = http
        .get(format!("{base}/api/clients/{id}/requests"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    let caps = caps.as_array().unwrap();
    assert_eq!(caps.len(), 1);
    assert_eq!(caps[0]["path"], "/v1/messages");
    assert_eq!(caps[0]["status"], 202);
    assert!(caps[0]["body"].as_str().unwrap().contains("21.5"));
    let headers = caps[0]["headers"].as_array().unwrap();
    assert!(
        headers
            .iter()
            .any(|h| h[0] == "authorization" && h[1] == "***"),
        "{headers:?}"
    );
    assert!(
        !serde_json::to_string(caps).unwrap().contains(&token),
        "the token never appears in a capture"
    );

    // The test button (K14) sends with this client's token and shows up as a capture.
    let res = http
        .post(format!("{base}/api/clients/{id}/test"))
        .send()
        .unwrap();
    assert_eq!(res.status(), 200, "{}", res.text().unwrap());
    let caps: Vec<serde_json::Value> = http
        .get(format!("{base}/api/clients/{id}/requests"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    assert_eq!(caps.len(), 2);

    // last_used_at moved (rule 22: shown to take two values).
    let list: Vec<serde_json::Value> = http
        .get(format!("{base}/api/clients"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    assert!(list[0]["last_used_at"].is_string());
    assert_eq!(list[0]["uses"], 2);

    // Revoke: the token is refused within the same second; the row stays.
    let res = http
        .post(format!("{base}/api/clients/{id}/revoke"))
        .send()
        .unwrap();
    assert_eq!(res.status(), 200);
    let res = anon
        .post(format!("{base}/v1/messages"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .unwrap();
    assert_eq!(res.status(), 401);
    let list: Vec<serde_json::Value> = http
        .get(format!("{base}/api/clients"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["active"], false);

    // Logout kills the session.
    let res = http.post(format!("{base}/logout")).send().unwrap();
    assert_eq!(res.status(), 303);
    let res = http.get(format!("{base}/api/clients")).send().unwrap();
    assert_eq!(res.status(), 303);

    // Plaintext scan (rule 10): the token is nowhere on disk.
    for entry in std::fs::read_dir(dir.path()).unwrap() {
        let raw = std::fs::read_to_string(entry.unwrap().path()).unwrap();
        assert!(
            !raw.contains(&token) && !raw.contains(TOKEN),
            "a secret reached disk in plaintext"
        );
    }
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
        "--token",
        TOKEN,
        "--secret-key",
        KEY,
        "--public-url",
        "https://inbox.example.lan",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
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

// K15 + K16 + K17 over the wire: the HTML pages render inside the shared
// layout with an explain block, the theme picker and the vendored assets.
#[test]
fn dashboard_pages_render_with_layout_and_assets() {
    let dir = tempfile::tempdir().unwrap();
    let (_child, addr) = start(dir.path());
    let base = format!("http://{addr}");
    let http = reqwest::blocking::Client::builder()
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();

    // Login page: public, explain block, theme picker, assets with a hash.
    let res = http.get(format!("{base}/login")).send().unwrap();
    assert_eq!(res.status(), 200);
    let html = res.text().unwrap();
    assert!(html.contains("class=\"explain\""), "explain block (K16)");
    assert!(html.contains("data-kp-theme-picker"), "theme picker (K15)");
    assert!(
        html.contains("data-kp-theme=\"cyberpunk\""),
        "themes from the registry"
    );
    let asset_url = html
        .split('"')
        .find(|s| s.starts_with("/static/themes.css?v="))
        .expect("versioned asset link")
        .to_string();
    let res = http.get(format!("{base}{asset_url}")).send().unwrap();
    assert_eq!(res.status(), 200);
    assert_eq!(
        res.headers()["cache-control"],
        "public, max-age=31536000, immutable"
    );
    assert!(
        res.text().unwrap().contains("--background"),
        "the vendored stylesheet"
    );

    // Wrong token re-renders the login page (200) with the message inside the layout.
    let res = http
        .post(format!("{base}/login"))
        .form(&[("token", "nope")])
        .send()
        .unwrap();
    assert_eq!(res.status(), 200);
    let html = res.text().unwrap();
    assert!(
        html.contains("not right") && html.contains("kp-alert"),
        "{html}"
    );

    // Status page after login: version, health, update card, nav.
    http.post(format!("{base}/login"))
        .form(&[("token", TOKEN)])
        .send()
        .unwrap();
    let res = http.get(format!("{base}/")).send().unwrap();
    assert_eq!(res.status(), 200);
    let html = res.text().unwrap();
    assert!(
        html.contains("inbox 0.") || html.contains("0.1.0"),
        "version on the status page"
    );
    assert!(
        html.contains("Health") && html.contains("Updates"),
        "the kit cards"
    );
    assert!(
        html.contains("Messages") && html.contains("Received"),
        "the project's own status section (K17)"
    );
    assert!(html.contains("aria-current=\"page\""), "active nav entry");
    assert!(html.contains("Log out"));

    // Clients page: issue one via the API, then the row carries the buttons.
    http.post(format!("{base}/api/clients"))
        .json(&serde_json::json!({ "name": "page-test" }))
        .send()
        .unwrap();
    let res = http.get(format!("{base}/clients")).send().unwrap();
    assert_eq!(res.status(), 200);
    let html = res.text().unwrap();
    assert!(html.contains("page-test"));
    assert!(
        html.contains("<th>Messages</th>"),
        "the project's extra client column (K16)"
    );
    for needle in [
        "data-reveal=",
        "data-copy-token=",
        "data-copy-command=",
        "data-requests=",
        "data-test=",
        "data-kp-confirm=",
    ] {
        assert!(html.contains(needle), "clients page lacks {needle}");
    }
    assert!(
        !html.contains("Bearer "),
        "no token or command in the page HTML (K12)"
    );
}

// K9 gating: passkey routes exist only when the request came over HTTPS
// as vouched for by a trusted proxy; plain HTTP gets a 404 with a remedy,
// and a spoofed header from an untrusted peer changes nothing.
#[test]
fn passkeys_exist_only_over_https_from_a_trusted_proxy() {
    let dir = tempfile::tempdir().unwrap();
    // First instance: no trusted proxies → never https.
    let (_child, addr) = start(dir.path());
    let base = format!("http://{addr}");
    let http = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let res = http
        .post(format!("{base}/passkeys/login/start"))
        .send()
        .unwrap();
    assert_eq!(res.status(), 404);
    let body: serde_json::Value = res.json().unwrap();
    assert!(
        body["remedy"].as_str().unwrap().contains("TRUSTED_PROXIES"),
        "{body}"
    );
    // A spoofed header from an untrusted peer is ignored.
    let res = http
        .post(format!("{base}/passkeys/login/start"))
        .header("x-forwarded-proto", "https")
        .send()
        .unwrap();
    assert_eq!(res.status(), 404);
    let html = http
        .get(format!("{base}/login"))
        .send()
        .unwrap()
        .text()
        .unwrap();
    assert!(
        !html.contains("data-passkey-login"),
        "no passkey button on plain HTTP"
    );
    drop(_child);

    // Second instance: the test runner's loopback is a trusted proxy, so
    // X-Forwarded-Proto: https counts (the offline way to test K9).
    let dir2 = tempfile::tempdir().unwrap();
    let mut child = Reaper(
        with_secrets(inbox())
            .args(["--listen", "127.0.0.1:0", "--trusted-proxies", "127.0.0.1"])
            .env("INBOX_STATE_DIR", dir2.path())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let stderr = child.0.stderr.take().unwrap();
    let mut lines = BufReader::new(stderr).lines();
    let addr2 = loop {
        let line = lines
            .next()
            .expect("stderr closed before listening")
            .unwrap();
        if let Some(a) = line
            .split_whitespace()
            .find_map(|w| w.strip_prefix("addr="))
        {
            break a.to_string();
        }
    };
    std::thread::spawn(move || for _ in lines {});
    let base2 = format!("http://{addr2}");
    let html = http
        .get(format!("{base2}/login"))
        .header("x-forwarded-proto", "https")
        .send()
        .unwrap()
        .text()
        .unwrap();
    assert!(
        html.contains("data-passkey-login"),
        "passkey button over https"
    );
    assert!(
        html.contains("/static/passkeys.js?v="),
        "passkeys script loaded"
    );
    let res = http
        .post(format!("{base2}/passkeys/login/start"))
        .header("x-forwarded-proto", "https")
        .send()
        .unwrap();
    assert_eq!(
        res.status(),
        404,
        "reachable, but no passkey registered yet"
    );
    let body: serde_json::Value = res.json().unwrap();
    assert!(
        body["remedy"].as_str().unwrap().contains("register one"),
        "{body}"
    );
    // The registration start needs an admin session; it answers a challenge.
    let admin = reqwest::blocking::Client::builder()
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let res = admin
        .post(format!("{base2}/login"))
        .header("x-forwarded-proto", "https")
        .form(&[("token", TOKEN)])
        .send()
        .unwrap();
    assert_eq!(res.status(), 303);
    assert!(
        res.headers()["set-cookie"]
            .to_str()
            .unwrap()
            .contains("Secure"),
        "Secure cookie over https"
    );
    let res = admin
        .post(format!("{base2}/passkeys/register/start"))
        .header("x-forwarded-proto", "https")
        .send()
        .unwrap();
    assert_eq!(res.status(), 200, "{}", res.text().unwrap());
    let start: serde_json::Value = res.json().unwrap();
    assert!(start["ceremony"].is_string());
    assert_eq!(
        start["options"]["publicKey"]["rp"]["id"],
        "inbox.example.lan"
    );
    let page = admin
        .get(format!("{base2}/passkeys"))
        .header("x-forwarded-proto", "https")
        .send()
        .unwrap();
    assert_eq!(page.status(), 200);
    assert!(page.text().unwrap().contains("data-passkey-register"));
}

// K18/K19 over the wire: `inbox update` trusts only the compiled-in key.
// A release signed by any other key is refused before a hash is read and
// nothing on disk changes; an unreachable host is a clean exit 1 with a
// remedy; `update_mode` and `update_drill` are validated by --check.
#[test]
fn update_subcommand_refuses_a_foreign_signature_and_touches_nothing() {
    use std::io::Write;
    // A fake release signed by a key that is NOT the ecosystem key.
    let release = tempfile::tempdir().unwrap();
    let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
    let binary = b"#!/bin/sh\nexit 0\n";
    let manifest = format!("{}  inbox\n", hex::encode(sha2::Sha256::digest(binary)));
    let sig = minisign::sign(Some(&kp.pk), &kp.sk, manifest.as_bytes(), None, None).unwrap();
    std::fs::write(release.path().join("VERSION"), "99.0.0").unwrap();
    std::fs::write(release.path().join("SHA256SUMS"), &manifest).unwrap();
    std::fs::write(release.path().join("SHA256SUMS.minisig"), sig.into_string()).unwrap();
    std::fs::write(release.path().join("inbox"), binary).unwrap();
    // Serve it with a tiny blocking HTTP server on a thread.
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let root = release.path().to_path_buf();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let mut stream = stream;
            let mut buf = [0u8; 2048];
            let n = std::io::Read::read(&mut stream, &mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]);
            let path = req
                .split_whitespace()
                .nth(1)
                .unwrap_or("/")
                .trim_start_matches('/')
                .to_string();
            let (status, body) = match std::fs::read(root.join(&path)) {
                Ok(b) => ("200 OK", b),
                Err(_) => ("404 Not Found", Vec::new()),
            };
            let _ = write!(
                stream,
                "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(&body);
        }
    });

    let dir = tempfile::tempdir().unwrap();
    let bin_before = std::fs::read(env!("CARGO_BIN_EXE_inbox")).unwrap();
    let out = with_secrets(inbox())
        .args([
            "update",
            "--update-url",
            &format!("http://{addr}"),
            "--listen",
            "127.0.0.1:0",
        ])
        .env("INBOX_STATE_DIR", dir.path())
        .output()
        .unwrap();
    assert!(
        !out.status.success(),
        "a foreign signature must fail: {}",
        String::from_utf8_lossy(&out.stdout)
    );
    let stderr = String::from_utf8(out.stderr).unwrap();
    assert!(stderr.contains("signature does not verify"), "{stderr}");
    assert!(stderr.contains("nothing was installed"), "{stderr}");
    assert_eq!(
        std::fs::read(env!("CARGO_BIN_EXE_inbox")).unwrap(),
        bin_before,
        "the binary is untouched"
    );
    assert!(!std::path::Path::new(&format!("{}.staging", env!("CARGO_BIN_EXE_inbox"))).exists());
    assert!(
        !dir.path().join("update-state.json").exists(),
        "supervised writes no state"
    );

    // Unreachable host: exit 1, remedy names the knob.
    let out = with_secrets(inbox())
        .args([
            "update",
            "--update-url",
            "http://127.0.0.1:9",
            "--listen",
            "127.0.0.1:0",
        ])
        .env("INBOX_STATE_DIR", dir.path())
        .output()
        .unwrap();
    assert!(!out.status.success());
    assert!(
        String::from_utf8(out.stderr)
            .unwrap()
            .contains("update_url")
    );

    // --check validates the update knobs.
    for (flag, value, needle) in [
        ("--update-mode", "sometimes", "update_mode"),
        ("--update-drill", "explode", "update_drill"),
        ("--update-hold", "not-a-version", "MAJOR.MINOR.PATCH"),
    ] {
        let out = with_secrets(inbox())
            .args(["--check", "--listen", "127.0.0.1:0", flag, value])
            .env("INBOX_STATE_DIR", dir.path())
            .output()
            .unwrap();
        assert!(!out.status.success(), "{flag} {value} must be refused");
        assert!(
            String::from_utf8(out.stderr).unwrap().contains(needle),
            "{flag}"
        );
    }
}
