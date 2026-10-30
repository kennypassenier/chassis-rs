//! The `update` subcommand refuses a foreign signature and touches nothing.

use sha2::Digest;

use super::support::*;

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
