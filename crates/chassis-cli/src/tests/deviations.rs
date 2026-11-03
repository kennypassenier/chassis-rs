//! runner-2: a kit-owned file the project declares as a deviation is
//! reported with `~`, left alone, and ends `sync` with its own exit code.

use crate::exit_codes::Finish;
use crate::new_project::cmd_new;
use crate::sync::cmd_sync;

fn new_project(dir: &std::path::Path) -> std::path::PathBuf {
    let target = dir.join("demo-svc");
    cmd_new(
        "demo-svc".into(),
        "A demo".into(),
        None,
        Some(target.clone()),
        true,
        None,
        Some("v0.1.0".into()),
        false,
    )
    .unwrap();
    target
}

#[test]
fn a_declared_deviation_is_kept_and_exits_with_its_own_code() {
    let dir = tempfile::tempdir().unwrap();
    let target = new_project(dir.path());
    let deny = target.join("deny.toml");
    let edited = format!(
        "{}\n# the project's own line\n",
        std::fs::read_to_string(&deny).unwrap()
    );
    std::fs::write(&deny, &edited).unwrap();

    // Undeclared: plain drift, the old exit 1.
    let out = cmd_sync(&target, false, false, false, false).unwrap();
    assert_eq!(out.finish(), Finish::Unresolved);

    // Declared: reported, never written, and no longer a fault.
    let toml_path = target.join(".chassis.toml");
    let toml = std::fs::read_to_string(&toml_path).unwrap();
    std::fs::write(&toml_path, format!("{toml}deviations = [\"deny.toml\"]\n")).unwrap();
    let out = cmd_sync(&target, true, false, false, false).unwrap();
    assert!(out.deviation && !out.unresolved, "{out:?}");
    assert_eq!(out.finish(), Finish::DeclaredDeviation);
    assert_eq!(std::fs::read_to_string(&deny).unwrap(), edited);

    // --force still means what it says.
    let out = cmd_sync(&target, true, true, false, false).unwrap();
    assert_eq!(out.finish(), Finish::Clean);
    assert_ne!(std::fs::read_to_string(&deny).unwrap(), edited);
}

#[test]
fn undeclared_drift_beats_a_declared_deviation() {
    let outcome = crate::sync::SyncOutcome {
        changed: true,
        unresolved: true,
        deviation: true,
    };
    assert_eq!(outcome.finish(), Finish::Unresolved);
}
