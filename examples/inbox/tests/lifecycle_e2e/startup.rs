//! Starting, `--version`, `--print-config`, `--check`, `knobs` and the help text: what
//! the binary answers before (or without) serving anything.

use super::support::*;

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

// K31: --knobs prints the knob table on stdout and exits 0 without
// reading configuration (garbage LISTEN, no secrets) and without touching
// the state dir. Drilled red once by skipping the kit's early answer, so
// the garbage listen address made it exit 1.
#[test]
fn k31_knobs_prints_the_table_and_touches_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let out = inbox()
        .args(["--knobs"])
        .env("INBOX_LISTEN", "garbage")
        .env("INBOX_STATE_DIR", dir.path())
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8(out.stdout).unwrap();
    assert!(
        stdout.starts_with("| Key | Env | Flag | Default | Feature | Meaning |"),
        "{stdout}"
    );
    for needle in [
        "| `listen` | `INBOX_LISTEN` | `--listen` | `0.0.0.0:8080` | core |",
        "| `token` | `INBOX_TOKEN` | — | (secret) | dashboard |",
        "| `update_mode` | `INBOX_UPDATE_MODE` | `--update-mode` | `off` | self-update |",
        "| `notify_retries` |",
    ] {
        assert!(stdout.contains(needle), "--knobs lacks {needle}:\n{stdout}");
    }
    assert_eq!(
        std::fs::read_dir(dir.path()).unwrap().count(),
        0,
        "--knobs wrote into the state dir"
    );
    assert!(out.stderr.is_empty(), "nothing on stderr");
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
