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

/// A command that acts on the repository at `dir`, whatever git exported
/// to this test: from a pre-commit hook in a linked worktree the test
/// inherits `GIT_DIR` (+ `GIT_INDEX_FILE`), and `git log` in a temp dir
/// would otherwise read the kit's own history.
fn in_repo(program: &str, dir: &std::path::Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.current_dir(dir);
    for var in ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"] {
        cmd.env_remove(var);
    }
    cmd
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
    let out = in_repo("bash", &project)
        .arg(&gates)
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

    // The scaffold's own sync sees no drift — in the files and (K32) in the
    // kit tag, kp_themes and the path dependency it reports as a note.
    // Drilled red once (misspelt the note's needle): failed, restored.
    let out = chassis()
        .args(["sync", "--dir", project.to_str().unwrap()])
        .output()
        .unwrap();
    let sync_out = String::from_utf8_lossy(&out.stdout);
    assert!(
        out.status.success(),
        "sync right after new must be clean: {sync_out}"
    );
    assert!(
        sync_out.contains("in sync with the scaffold of chassis"),
        "{sync_out}"
    );
    assert!(
        sync_out.contains("path dependency"),
        "a --chassis-path project is told its tag is not compared: {sync_out}"
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

/// K23, live-found 2026-09-07: git exports `GIT_DIR` (absolute in a linked
/// worktree) and `GIT_INDEX_FILE` to its hooks, and the pre-commit gate runs
/// this suite. `chassis new` spawns `git init`/`add`/`commit` for the fresh
/// project; with those variables inherited, every one of them acted on the
/// repository being committed instead and put the scaffold files on the
/// committer's branch. Red before the fix (the outer repository gained a
/// commit), green after it.
#[test]
fn k23_new_inside_a_foreign_git_context_touches_only_its_own_repository() {
    let kit = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../chassis");
    let dir = tempfile::tempdir().unwrap();
    let outer = dir.path().join("outer");
    std::fs::create_dir_all(&outer).unwrap();
    let git = |args: &[&str]| {
        let out = Command::new("git")
            .args(["-c", "user.name=t", "-c", "user.email=t@example.invalid"])
            .args(args)
            .current_dir(&outer)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    };
    git(&["init", "-q"]);
    std::fs::write(outer.join("outer.txt"), "outer\n").unwrap();
    git(&["add", "outer.txt"]);
    git(&["commit", "-q", "-m", "outer"]);
    let head_before = git(&["rev-parse", "HEAD"]);

    let project = dir.path().join("demo-svc");
    let out = chassis()
        .args([
            "new",
            "demo-svc",
            "--no-remote",
            "--dir",
            project.to_str().unwrap(),
            "--chassis-path",
            kit.to_str().unwrap(),
            "--chassis-tag",
            "v0.0.0-test",
        ])
        // What a git hook's child sees.
        .env("GIT_DIR", outer.join(".git"))
        .env("GIT_INDEX_FILE", outer.join(".git/index"))
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "chassis new failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );

    assert_eq!(
        git(&["rev-parse", "HEAD"]),
        head_before,
        "the outer repository gained a commit"
    );
    assert_eq!(
        git(&["status", "--porcelain"]),
        "",
        "the outer repository's tree or index moved"
    );
    assert!(
        project.join(".git").exists(),
        "the new project has its own repository"
    );
    let log = Command::new("git")
        .args(["log", "--oneline"])
        .current_dir(&project)
        .output()
        .unwrap();
    assert!(log.status.success());
    assert_eq!(
        String::from_utf8_lossy(&log.stdout).lines().count(),
        1,
        "the new project holds exactly its first commit"
    );
}
