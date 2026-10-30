//! Tests of `--check` and of the project's half of the configuration.

use super::*;

#[tokio::test]
async fn check_runs_project_hooks_and_reports_their_remedy() {
    let dir = tempfile::tempdir().unwrap();
    // With the dashboard compiled in, --check needs the secrets first (W6).
    let mut args = secrets_env(dir.path());
    args.push("--check");
    let mut app = from_args_secret(spec(), argv(&args), Router::new()).unwrap();
    app.on_check(|| {
        Err(Error::config(
            "store is from the future",
            "downgrade is not possible; restore the pre-update copy",
        ))
    });
    let err = app.control().await.unwrap_err();
    assert!(err.remedy.contains("pre-update copy"));

    let err = App::from_args(
        spec(),
        argv(&[
            "--check",
            "--state-dir",
            dir.path().to_str().unwrap(),
            "--listen",
            "not-an-address",
        ]),
        Router::new(),
    )
    .err()
    .expect("a bad listen address is an error");
    assert!(err.message.contains("listen address"));
}

/// feat-config-1: the whole call site is one line, and what comes back
/// carries none of the kit's keys or sections.
#[test]
fn project_config_is_one_call_on_the_app_and_carries_only_the_projects_keys() {
    #[derive(Debug, PartialEq, serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Config {
        topic: String,
    }
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("config.toml"),
        concat!(
            "listen = \"127.0.0.1:0\"\n",
            "topic = \"ops.alerts\"\n",
            "\n[[notify.webhook]]\n",
            "events = [\"update.ok\"]\n",
            "url = \"http://h\"\n",
        ),
    )
    .unwrap();
    let app = App::from_args_with_env(
        spec(),
        argv(&base_args(dir.path())),
        BTreeMap::new(),
        Router::new(),
    )
    .unwrap();
    let config: Config = app.project_config().unwrap();
    assert_eq!(
        config,
        Config {
            topic: "ops.alerts".to_string()
        }
    );
    let version_only =
        App::from_args_with_env(spec(), argv(&["--version"]), BTreeMap::new(), Router::new())
            .unwrap();
    let err = version_only.project_table().unwrap_err();
    assert!(err.remedy.contains("needs_project_config()"), "{err}");
}

/// 1.2.0: which invocations read the project's own configuration.
#[test]
fn needs_project_config_is_true_only_for_a_start_and_a_check() {
    let dir = tempfile::tempdir().unwrap();
    let base = base_args(dir.path());
    let with = |extra: &[&str]| {
        let mut args = base.clone();
        args.extend_from_slice(extra);
        App::from_args_with_env(spec(), argv(&args), BTreeMap::new(), Router::new()).unwrap()
    };
    assert!(with(&[]).needs_project_config(), "a real start");
    assert!(with(&["--check"]).needs_project_config(), "--check");
    for control in [
        vec!["--version"],
        vec!["--help"],
        vec!["--print-config"],
        vec!["--knobs"],
        vec!["--healthcheck", "http://127.0.0.1:1/healthz"],
    ] {
        assert!(
            !with(&control).needs_project_config(),
            "{control:?} is the kit's alone"
        );
    }
}
