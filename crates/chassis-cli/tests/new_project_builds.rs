//! K23 end to end: `chassis new` writes a project that compiles against
//! this checkout of the kit and answers `--version` — the walking skeleton
//! every new service starts from. Uses `--chassis-path` so no git tag or
//! network is needed, and shares the workspace's target directory so the
//! kit's dependencies are compiled once.
//!
//! The phases of the first test are in `new_project_builds/generated_project.rs`,
//! the foreign-git fixture in `foreign_git.rs`, the shared helpers in `support.rs`.

#[path = "new_project_builds/foreign_git.rs"]
mod foreign_git;
#[path = "new_project_builds/generated_commands.rs"]
mod generated_commands;
#[path = "new_project_builds/generated_project.rs"]
mod generated_project;
#[path = "new_project_builds/support.rs"]
mod support;

use std::path::PathBuf;
use std::process::Command;

use foreign_git::OuterRepo;
use generated_commands::*;
use generated_project::*;
use support::chassis;

#[test]
fn a_new_project_compiles_and_answers_version() {
    let p = Project::create();
    let smoke = written_documents(&p);
    passes_its_own_gates(&p);
    passes_cargo_deny(&p);
    systemd_unit_parses(&p);
    sync_is_clean(&p);
    sync_restores_the_smoke_test(&p, &smoke);
    unfixable_drift_exits_one(&p);
    release_plan_names_every_step(&p);
    builds_and_answers_version(&p);
    check_without_secrets_names_gen_secret(&p);
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
    let outer = OuterRepo::create(dir.path());
    let head_before = outer.git(&["rev-parse", "HEAD"]);

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
        .env("GIT_DIR", outer.path.join(".git"))
        .env("GIT_INDEX_FILE", outer.path.join(".git/index"))
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "chassis new failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );

    assert_eq!(
        outer.git(&["rev-parse", "HEAD"]),
        head_before,
        "the outer repository gained a commit"
    );
    assert_eq!(
        outer.git(&["status", "--porcelain"]),
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
