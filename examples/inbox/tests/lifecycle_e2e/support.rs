//! What every inbox end-to-end test shares: starting the real binary on port 0
//! with a clean environment, reading its address back, a logged-in session,
//! issuing a client, and stopping it without leaving a process behind.

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub const TOKEN: &str = "a-login-token-that-is-long-enough";
pub const KEY: &str = "abababababababababababababababababababababababababababababababab";

/// Kills the child when the test panics, so a failed assertion never
/// leaves an `inbox` process holding the test runner's pipes open (which
/// is exactly how this test hung the first time it failed).
pub struct Reaper(pub std::process::Child);

impl Drop for Reaper {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

pub fn inbox() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_inbox"));
    // A clean environment: the binary must not depend on anything the
    // test runner happens to have set.
    c.env_clear();
    c.env("PATH", std::env::var("PATH").unwrap_or_default());
    c
}

pub fn with_secrets(mut c: Command) -> Command {
    c.env("INBOX_TOKEN", TOKEN)
        .env("INBOX_SECRET_KEY", KEY)
        // Only read when the passkeys feature is compiled in (K9).
        .env("INBOX_PUBLIC_URL", "https://inbox.example.lan");
    c
}

/// Start the binary on port 0 and return the child plus its address,
/// read from the `listening` log line.
pub fn start(dir: &std::path::Path) -> (Reaper, String) {
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

/// Start the binary with extra args and keep EVERY stderr line (H4: the log
/// is scanned for secrets afterwards; W1: access lines carry request ids).
pub fn start_capturing(
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

pub fn login_jar(addr: &str) -> reqwest::blocking::Client {
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

pub fn issue_client(
    client: &reqwest::blocking::Client,
    addr: &str,
    name: &str,
) -> (String, String) {
    let created: serde_json::Value = client
        .post(format!("http://{addr}/api/clients"))
        .json(&serde_json::json!({"name": name, "topic": "alerts"}))
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

pub fn stop(child: &mut Reaper) {
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
