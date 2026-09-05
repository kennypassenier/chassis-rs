//! K23 end to end: `chassis new` writes a project that compiles against
//! this checkout of the kit and answers `--version` — the walking skeleton
//! every new service starts from. Uses `--chassis-path` so no git tag or
//! network is needed, and shares the workspace's target directory so the
//! kit's dependencies are compiled once.

use std::path::PathBuf;
use std::process::Command;

fn chassis() -> Command {
    Command::new(env!("CARGO_BIN_EXE_chassis"))
}

#[test]
fn a_new_project_compiles_and_answers_version() {
    let kit = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../chassis");
    let workspace_target = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target");
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("demo-svc");

    let out = chassis()
        .args([
            "new",
            "demo-svc",
            "--no-remote",
            "--description",
            "A demo service for the kit's own test",
            "--dir",
            project.to_str().unwrap(),
            "--chassis-path",
            kit.to_str().unwrap(),
            "--chassis-tag",
            "v0.0.0-test",
        ])
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "chassis new failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("first commit"), "{stdout}");
    assert!(
        stdout.contains("--no-remote"),
        "tells how to create the remote later"
    );

    // The scaffold's own sync sees no drift.
    let out = chassis()
        .args(["sync", "--dir", project.to_str().unwrap()])
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "sync right after new must be clean: {}",
        String::from_utf8_lossy(&out.stdout)
    );

    // A dry-run release names every step without touching git or gh.
    let out = chassis()
        .args([
            "release",
            "0.2.0",
            "--dir",
            project.to_str().unwrap(),
            "--dry-run",
        ])
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let plan = String::from_utf8_lossy(&out.stdout);
    for needle in [
        "Cargo.toml version = \"0.2.0\"",
        "release-0.2.0",
        "git tag v0.2.0",
        "sign-release.sh v0.2.0",
    ] {
        assert!(plan.contains(needle), "release plan lacks {needle}: {plan}");
    }
    assert_eq!(
        std::fs::read_to_string(project.join("Cargo.toml"))
            .unwrap()
            .matches("0.2.0")
            .count(),
        0,
        "dry run wrote nothing"
    );

    // It builds and runs: the generated main.rs against this kit.
    let build = Command::new("cargo")
        .args(["build", "--quiet", "--offline"])
        .env("CARGO_TARGET_DIR", &workspace_target)
        .current_dir(&project)
        .output()
        .unwrap();
    let build = if build.status.success() {
        build
    } else {
        // The registry cache may lack a crate the generated project needs;
        // one online build fills it and is what a real user gets anyway.
        Command::new("cargo")
            .args(["build", "--quiet"])
            .env("CARGO_TARGET_DIR", &workspace_target)
            .current_dir(&project)
            .output()
            .unwrap()
    };
    assert!(
        build.status.success(),
        "generated project does not build: {}",
        String::from_utf8_lossy(&build.stderr)
    );
    let out = Command::new(workspace_target.join("debug").join("demo-svc"))
        .args(["--version"])
        .env_clear()
        .output()
        .unwrap();
    assert!(out.status.success());
    assert_eq!(
        String::from_utf8_lossy(&out.stdout).trim(),
        "demo-svc 0.1.0"
    );

    // --check without secrets refuses with the gen-secret remedy (W6) — the
    // generated project carries the kit's behaviour unchanged.
    let out = Command::new(workspace_target.join("debug").join("demo-svc"))
        .args(["--check", "--state-dir", dir.path().to_str().unwrap()])
        .env_clear()
        .output()
        .unwrap();
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("gen-secret"));
}
