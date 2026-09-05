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
    // S1: a plain-http release host is refused outright unless the operator
    // says update_allow_insecure — before any byte is fetched.
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
        "http:// without allow_insecure must fail"
    );
    let stderr = String::from_utf8(out.stderr).unwrap();
    assert!(stderr.contains("not https://"), "{stderr}");
    assert!(stderr.contains("update_allow_insecure"), "{stderr}");

    let out = with_secrets(inbox())
        .args([
            "update",
            "--update-url",
            &format!("http://{addr}"),
            "--update-allow-insecure",
            "true",
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

// ───────────────────────── Phase 7 hardening (H3, H4, H6, H8, H11, H15, S3, S4) ─────────────────────────

/// Start the binary with extra args and keep EVERY stderr line (H4: the log
/// is scanned for secrets afterwards; W1: access lines carry request ids).
fn start_capturing(
    dir: &std::path::Path,
    extra: &[&str],
    extra_env: &[(&str, &str)],
) -> (
    Reaper,
    String,
    std::sync::Arc<std::sync::Mutex<Vec<String>>>,
) {
    let mut cmd = with_secrets(inbox());
    cmd.args(["--listen", "127.0.0.1:0", "--shutdown-timeout-ms", "5000"])
        .args(extra)
        .env("INBOX_STATE_DIR", dir)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    for (k, v) in extra_env {
        cmd.env(k, v);
    }
    let mut child = Reaper(cmd.spawn().unwrap());
    let stderr = child.0.stderr.take().unwrap();
    let lines = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let sink = lines.clone();
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if line.contains("listening") {
                let _ = tx.send(line.clone());
            }
            sink.lock().unwrap().push(line);
        }
    });
    let line = rx
        .recv_timeout(Duration::from_secs(10))
        .expect("no 'listening' line within 10 s");
    let addr = line
        .split_whitespace()
        .find_map(|w| w.strip_prefix("addr=").map(|a| a.to_string()))
        .or_else(|| {
            // JSON mode: {"fields":{"addr":"127.0.0.1:port", ...}}
            serde_json::from_str::<serde_json::Value>(&line)
                .ok()
                .and_then(|v| v["fields"]["addr"].as_str().map(|a| a.to_string()))
        })
        .expect("addr in the listening line");
    (child, addr, lines)
}

fn login_jar(addr: &str) -> reqwest::blocking::Client {
    let client = reqwest::blocking::Client::builder()
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let res = client
        .post(format!("http://{addr}/login"))
        .form(&[("token", TOKEN)])
        .send()
        .unwrap();
    assert_eq!(res.status().as_u16(), 303, "login redirects");
    client
}

fn issue_client(client: &reqwest::blocking::Client, addr: &str, name: &str) -> (String, String) {
    let created: serde_json::Value = client
        .post(format!("http://{addr}/api/clients"))
        .json(&serde_json::json!({"name": name}))
        .send()
        .unwrap()
        .json()
        .unwrap();
    let id = created["id"].as_str().unwrap().to_string();
    let revealed: serde_json::Value = client
        .get(format!("http://{addr}/api/clients/{id}/token"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    (id, revealed["token"].as_str().unwrap().to_string())
}

fn stop(child: &mut Reaper) {
    // SIGTERM, then wait: the drain and the shutdown persist run.
    let _ = Command::new("kill")
        .args(["-TERM", &child.0.id().to_string()])
        .status();
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.0.try_wait() {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    panic!("the service did not exit within 10 s of SIGTERM");
}

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

// H3 / K10: both limiters are hit through the real router: login per IP,
// API per client token; each answers 429 with Retry-After.
#[test]
fn login_and_token_rate_limits_answer_429_with_retry_after() {
    let dir = tempfile::tempdir().unwrap();
    let (mut child, addr, _) = start_capturing(
        dir.path(),
        &[
            "--rate-limit-login-per-min",
            "3",
            "--rate-limit-login-burst",
            "3",
            "--rate-limit-token-per-sec",
            "2",
            "--rate-limit-token-burst",
            "2",
        ],
        &[],
    );
    let plain = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    // Log in first: the login limiter counts every attempt from this IP.
    let admin = login_jar(&addr);
    let (_id, token) = issue_client(&admin, &addr, "hammer");
    let mut api = Vec::new();
    let mut retry_after = None;
    for _ in 0..6 {
        let res = plain
            .post(format!("http://{addr}/v1/messages"))
            .bearer_auth(&token)
            .json(&serde_json::json!({"x": 1}))
            .send()
            .unwrap();
        if res.status().as_u16() == 429 {
            retry_after = res
                .headers()
                .get("retry-after")
                .map(|v| v.to_str().unwrap().to_string());
        }
        api.push(res.status().as_u16());
    }
    assert!(api.contains(&429), "token limiter never fired: {api:?}");
    assert!(
        api[..2].iter().all(|s| *s == 202),
        "the burst of 2 passes first: {api:?}"
    );
    assert!(retry_after.is_some(), "429 carries Retry-After");
    // The admin's own calls are not throttled by the token limiter.
    for _ in 0..6 {
        assert_eq!(
            admin
                .get(format!("http://{addr}/api/clients"))
                .send()
                .unwrap()
                .status()
                .as_u16(),
            200
        );
    }
    // Now the login limiter: 3 per minute, burst 3; one succeeded above.
    let mut statuses = Vec::new();
    for _ in 0..5 {
        statuses.push(
            plain
                .post(format!("http://{addr}/login"))
                .form(&[("token", "wrong-token-wrong-token-wrong")])
                .send()
                .unwrap()
                .status()
                .as_u16(),
        );
    }
    assert!(
        statuses.contains(&429),
        "login limiter never fired: {statuses:?}"
    );
    assert_ne!(statuses[0], 429, "the burst passes first: {statuses:?}");
    stop(&mut child);
}

// H15 / K12 / W7: re-issue and delete over HTTP; the old token dies with
// each; /readyz does not exist (404, not a silent 200).
#[test]
fn reissue_and_delete_over_http_and_no_readyz() {
    let dir = tempfile::tempdir().unwrap();
    let (mut child, addr, _) = start_capturing(dir.path(), &[], &[]);
    let admin = login_jar(&addr);
    let (id, token) = issue_client(&admin, &addr, "rotating");
    let plain = reqwest::blocking::Client::new();
    let post = |t: &str| {
        plain
            .post(format!("http://{addr}/v1/messages"))
            .bearer_auth(t)
            .json(&serde_json::json!({"k": 1}))
            .send()
            .unwrap()
            .status()
            .as_u16()
    };
    assert_eq!(post(&token), 202);
    let reissued: serde_json::Value = admin
        .post(format!("http://{addr}/api/clients/{id}/reissue"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    assert_eq!(
        reissued["id"], id,
        "re-issue answers with the client row, never the token (K12)"
    );
    assert!(reissued.get("token").is_none(), "{reissued}");
    let revealed: serde_json::Value = admin
        .get(format!("http://{addr}/api/clients/{id}/token"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    let token2 = revealed["token"].as_str().unwrap().to_string();
    assert_ne!(token2, token);
    assert_eq!(post(&token), 401, "the old token is dead the same second");
    assert_eq!(post(&token2), 202, "the new token works");
    let res = admin
        .delete(format!("http://{addr}/api/clients/{id}"))
        .send()
        .unwrap();
    assert!(res.status().is_success(), "{}", res.status());
    assert_eq!(post(&token2), 401, "a deleted client's token is refused");
    let listed: serde_json::Value = admin
        .get(format!("http://{addr}/api/clients"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    assert!(
        listed.as_array().unwrap().iter().all(|c| c["id"] != id),
        "gone from the list"
    );
    // W7: no /readyz. An unknown path is never a 200 for a probe: the
    // no-redirect client sees the kit's answer itself (404, or the
    // dashboard's redirect to /login), not a followed login page.
    let no_redirect = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let status = no_redirect
        .get(format!("http://{addr}/readyz"))
        .send()
        .unwrap()
        .status()
        .as_u16();
    assert!(
        status == 404 || (300..400).contains(&status),
        "W7: /readyz answered {status}"
    );
    stop(&mut child);
}

// S3 / K10 / K13: a body above max_body_bytes on a CAPTURED api route is a
// 413, not an empty body handed to the handler.
#[test]
fn oversized_body_on_an_api_route_is_413_not_empty() {
    let dir = tempfile::tempdir().unwrap();
    let (mut child, addr, _) = start_capturing(dir.path(), &["--max-body-bytes", "2048"], &[]);
    let admin = login_jar(&addr);
    let (_id, token) = issue_client(&admin, &addr, "big");
    let plain = reqwest::blocking::Client::new();
    let big = serde_json::json!({"payload": "x".repeat(4096)});
    let res = plain
        .post(format!("http://{addr}/v1/messages"))
        .bearer_auth(&token)
        .json(&big)
        .send()
        .unwrap();
    assert_eq!(res.status().as_u16(), 413);
    // A declared Content-Length is refused by the limit layer, a streamed
    // body by the capture layer (S3); both answer the kit's JSON shape with
    // a remedy (AR4), never a 2xx with an empty payload.
    let body: serde_json::Value = res.json().unwrap();
    assert!(
        body["remedy"].as_str().unwrap().contains("max_body_bytes"),
        "{body}"
    );
    let streamed = plain
        .post(format!("http://{addr}/v1/messages"))
        .bearer_auth(&token)
        .header("content-type", "application/json")
        .body(reqwest::blocking::Body::new(std::io::Cursor::new(
            serde_json::to_vec(&big).unwrap(),
        )))
        .send()
        .unwrap();
    assert_eq!(
        streamed.status().as_u16(),
        413,
        "a chunked oversized body is 413 too (S3)"
    );
    let headers = format!("{:?}", streamed.headers());
    let text = streamed.text().unwrap();
    let body: serde_json::Value = serde_json::from_str(&text).unwrap_or_else(|e| {
        panic!("streamed 413 body is not JSON ({e}); headers {headers}; body {text:?}")
    });
    assert!(
        body["remedy"].as_str().unwrap().contains("max_body_bytes"),
        "{body}"
    );
    let small = plain
        .post(format!("http://{addr}/v1/messages"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"payload": "ok"}))
        .send()
        .unwrap();
    assert_eq!(small.status().as_u16(), 202);
    stop(&mut child);
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

// S8 / K2: secrets are not command-line flags any more; --help lists the
// operational knobs and not the two secrets.
#[test]
fn help_lists_knobs_but_never_the_secret_flags() {
    let out = inbox().arg("--help").output().unwrap();
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    for flag in [
        "--listen",
        "--state-dir",
        "--update-url",
        "--rate-limit-token-per-sec",
        "--log-format",
    ] {
        assert!(text.contains(flag), "--help lacks {flag}:\n{text}");
    }
    for secret in ["--token", "--secret-key"] {
        assert!(
            !text.contains(secret),
            "{secret} must not be a flag (S8):\n{text}"
        );
    }
    assert!(text.contains("rekey"), "the rekey subcommand is listed");
}
