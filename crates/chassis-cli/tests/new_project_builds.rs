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

    // H10: the generated project passes ITS OWN gates (fmt, clippy -D
    // warnings, tests, clean tree) — what its first real commit will face.
    let gates = project.join(".claude/hooks/gates.sh");
    assert!(gates.exists(), "gates.sh is part of the scaffold");
    let out = Command::new("bash")
        .arg(&gates)
        .current_dir(&project)
        .env("CARGO_TARGET_DIR", &workspace_target)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "the generated project's gates failed:\n{}\n{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );

    // CF-6 (2026-09-06): the generated project must also pass cargo-deny.
    // The first remote project was red on it (a git dependency without a
    // version requirement) while every local gate above was green; the
    // gate that predicts CI has to run what CI runs. Runs when cargo-deny
    // is installed (the kit's CI installs it) and says so loudly otherwise.
    let deny_available = Command::new("cargo")
        .args(["deny", "--version"])
        .output()
        .is_ok_and(|o| o.status.success());
    if deny_available {
        let out = Command::new("cargo")
            .args(["deny", "check"])
            .current_dir(&project)
            .env("CARGO_TARGET_DIR", &workspace_target)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "the generated project fails cargo-deny:\n{}\n{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        );
    } else {
        eprintln!(
            "new_project_builds: cargo-deny is not installed — the cargo-deny check on the generated project was SKIPPED (CI runs it)"
        );
    }

    // H10: the rendered systemd units parse (systemd-analyze, when present).
    if let Ok(analyze) = Command::new("systemd-analyze")
        .args([
            "verify",
            project.join("deploy/demo-svc.service").to_str().unwrap(),
        ])
        .output()
    {
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&analyze.stdout),
            String::from_utf8_lossy(&analyze.stderr)
        );
        for line in text.lines().filter(|l| !l.trim().is_empty()) {
            assert!(
                line.contains("is not executable") || line.contains("No such file"),
                "systemd-analyze verify complains about the unit itself: {line}"
            );
        }
    }

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
