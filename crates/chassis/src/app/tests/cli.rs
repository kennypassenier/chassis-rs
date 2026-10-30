//! Tests of the command line: control flags answered without configuration,
//! refusals and remedies.

use super::*;

#[tokio::test]
async fn version_flag_reads_no_configuration() {
    // A state_dir pointing nowhere and a broken listen value: --version must not care (AR20).
    let mut app = App::from_args(
        spec(),
        argv(&[
            "--version",
            "--state-dir",
            "/nonexistent/x",
            "--listen",
            "garbage",
        ]),
        Router::new(),
    )
    .unwrap();
    assert!(app.loaded.is_none());
    assert_eq!(app.control().await.unwrap(), Some(ExitCode::SUCCESS));
}

/// K31: `--knobs` is answered like `--version`, before any
/// configuration is read. Drilled red once by skipping the early answer,
/// so the flag fell through to configuration loading.
#[tokio::test]
async fn k31_knobs_flag_reads_no_configuration() {
    let mut app = App::from_args(
        spec(),
        argv(&[
            "--knobs",
            "--state-dir",
            "/nonexistent/x",
            "--listen",
            "garbage",
        ]),
        Router::new(),
    )
    .unwrap();
    assert_eq!(app.control, Some(Control::Knobs));
    assert!(app.loaded.is_none(), "--knobs reads no configuration");
    assert_eq!(app.control().await.unwrap(), Some(ExitCode::SUCCESS));
}

#[tokio::test]
async fn gen_secret_refuses_a_pipe() {
    // Under `cargo test` stdout is not a terminal, so the guard fires (critic #12).
    let mut app = App::from_args(spec(), argv(&["gen-secret"]), Router::new()).unwrap();
    assert!(app.loaded.is_none(), "gen-secret reads no configuration");
    let err = app.control().await.unwrap_err();
    assert!(err.remedy.contains("terminal"));
}

#[test]
fn unknown_flag_is_refused_with_remedy() {
    let err = App::from_args(spec(), argv(&["--bogus"]), Router::new())
        .err()
        .expect("an unknown flag is an error");
    assert!(err.remedy.contains("--help"));
}

#[test]
fn shipped_defaults_pass_their_own_validation() {
    // HTTPSwitchboard rule: the defaults must survive the parser.
    let dir = tempfile::tempdir().unwrap();
    let app = App::from_args(spec(), argv(&base_args(dir.path())), Router::new()).unwrap();
    assert_eq!(app.limits.max_body_bytes, 1_048_576);
    assert_eq!(app.limits.max_in_flight, 64);
    assert_eq!(app.limits.request_timeout, Duration::from_secs(30));
    assert_eq!(app.limits.remember_me_secs, 30 * 86_400);
    assert!(app.limits.trusted_proxies.is_empty());
    let mut bad = base_args(dir.path());
    bad.extend(["--max-in-flight", "0"]);
    let err = App::from_args(spec(), argv(&bad), Router::new())
        .err()
        .expect("zero in-flight is refused");
    assert!(err.message.contains("max_in_flight"));
}

/// H2: every `<binary> <command>` a remedy tells the operator to run is a
/// real subcommand — a remedy naming a command that does not exist is a
/// lie the tests used to check for by word, not by existence.
#[test]
fn every_command_named_in_a_remedy_exists() {
    let sources = [
        include_str!("../../app.rs"),
        include_str!("../../core/crypto.rs"),
        include_str!("../../core/error.rs"),
        include_str!("../../shell/auth.rs"),
        include_str!("../../shell/store.rs"),
        include_str!("../../shell/update.rs"),
        include_str!("../../shell/config_load.rs"),
    ];
    let mut named = std::collections::BTreeSet::new();
    for src in sources {
        for (i, _) in src.match_indices("<binary> ") {
            let rest = &src[i + "<binary> ".len()..];
            let word: String = rest
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '-')
                .collect();
            if !word.is_empty() && !word.starts_with("--") {
                named.insert(word);
            }
        }
    }
    assert!(named.contains("rekey"), "{named:?}");
    for word in named {
        let parsed = App::from_args(spec(), argv(&[&word]), Router::new());
        assert!(
            parsed.is_ok(),
            "remedies name `<binary> {word}` but it does not parse as a command: {:?}",
            parsed.err().map(|e| e.message)
        );
    }
}

/// 1.2.0: `--help` is an answer (stdout, exit 0), it carries the
/// project's own text, and the unknown-flag refusal still points at it.
#[test]
fn help_is_an_answer_that_carries_the_project_text() {
    let with_extra = AppSpec {
        help_extra: Some("Project environment:\n  T_APP_HUB_TOKEN  the hub's app token"),
        ..spec()
    };
    let app = App::from_args_with_env(
        with_extra,
        argv(&["--help"]),
        BTreeMap::new(),
        Router::new(),
    )
    .unwrap();
    let Some(Control::Help(text)) = app.control else {
        panic!("--help must yield Control::Help, got {:?}", app.control);
    };
    assert!(
        text.contains("--listen"),
        "the kit's knobs are listed:\n{text}"
    );
    assert!(
        text.contains("T_APP_HUB_TOKEN"),
        "and the project's text:\n{text}"
    );
    assert!(app.loaded.is_none(), "help reads no configuration");
    let err = App::from_args_with_env(
        spec(),
        argv(&["--frobnicate"]),
        BTreeMap::new(),
        Router::new(),
    )
    .err()
    .expect("an unknown flag is refused");
    assert!(err.remedy.contains("--help"));
}
