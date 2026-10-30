//! Passkeys exist only over HTTPS from a trusted proxy.

use std::io::{BufRead, BufReader};
use std::process::Stdio;

use super::support::*;

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
    // S6 (1.4.0): the public ceremony start sits behind the /login IP
    // limiter — a burst from one address is answered 429 before it can
    // fill anyone's share of the ceremony table. Last in this test on
    // purpose: the limiter is per IP and shared with /login above.
    let mut statuses = Vec::new();
    for _ in 0..15 {
        let res = http
            .post(format!("{base2}/passkeys/login/start"))
            .header("x-forwarded-proto", "https")
            .send()
            .unwrap();
        statuses.push(res.status().as_u16());
    }
    assert!(
        statuses.contains(&429),
        "a burst of ceremony starts must hit the IP limiter: {statuses:?}"
    );
    let page = admin
        .get(format!("{base2}/passkeys"))
        .header("x-forwarded-proto", "https")
        .send()
        .unwrap();
    assert_eq!(page.status(), 200);
    assert!(page.text().unwrap().contains("data-passkey-register"));
}
