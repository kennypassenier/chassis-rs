//! `chassis new`: write a project from the scaffold, make the first commit and
//! (unless `--no-remote`) create the GitHub repository. Its own module because
//! it is the only command that starts from nothing; what it accepts as input
//! is checked in `new_validation`.

use std::path::{Path, PathBuf};

use chassis::Error;

use crate::new_validation::{validate_description, validate_name, validate_repo};
use crate::process::{capture, require_tool, run};
use crate::recorded::{CHASSIS_REPO, KP_THEMES, Recorded, TOOLCHAIN, scaffold_features};
use crate::render::{io_err, render_all, with_chassis_path, write_file};
use crate::templates;

#[allow(clippy::too_many_arguments)]
pub(crate) fn cmd_new(
    name: String,
    description: String,
    repo: Option<String>,
    dir: Option<PathBuf>,
    no_remote: bool,
    chassis_path: Option<PathBuf>,
    chassis_tag: Option<String>,
    latch: bool,
) -> Result<(), Error> {
    validate_name(&name)?;
    validate_description(&description)?;
    if let Some(r) = &repo {
        validate_repo(r)?;
    }
    let dir = dir.unwrap_or_else(|| PathBuf::from(&name));
    refuse_non_empty(&dir)?;
    let rec = new_record(name, description, repo, chassis_path, chassis_tag, latch);
    write_scaffold(&dir, &rec)?;
    init_repository(&dir)?;
    println!(
        "wrote {} with {} files and made the first commit",
        dir.display(),
        templates::ENTRIES.len()
    );

    if no_remote {
        println!(
            "--no-remote: create the repository later with `gh repo create {} --public --source . --push`",
            rec.repo
        );
    } else {
        create_remote(&dir, &rec)?;
    }
    println!(
        "Next: `cd {} && {} gen-secret` on a terminal, put both lines in /etc/{}/{}.env, and `cargo run -- --check`.",
        dir.display(),
        rec.name,
        rec.name,
        rec.name
    );
    Ok(())
}

/// `new` never writes into a directory that already holds something.
fn refuse_non_empty(dir: &Path) -> Result<(), Error> {
    if dir.exists()
        && std::fs::read_dir(dir)
            .map(|mut d| d.next().is_some())
            .unwrap_or(false)
    {
        return Err(Error::invalid(
            format!("{} exists and is not empty", dir.display()),
            "pick another --dir, or run `chassis sync` inside an existing project",
        ));
    }
    Ok(())
}

/// The record a fresh project starts with: the flags, plus the kit's own
/// constants for everything `new` does not ask about.
fn new_record(
    name: String,
    description: String,
    repo: Option<String>,
    chassis_path: Option<PathBuf>,
    chassis_tag: Option<String>,
    latch: bool,
) -> Recorded {
    Recorded {
        repo: repo.unwrap_or_else(|| format!("kennypassenier/{name}")),
        chassis_path: chassis_path
            .map(|p| std::fs::canonicalize(&p).unwrap_or(p).display().to_string()),
        chassis_tag: chassis_tag.unwrap_or_else(|| format!("v{}", env!("CARGO_PKG_VERSION"))),
        chassis_repo: CHASSIS_REPO.to_string(),
        toolchain: TOOLCHAIN.to_string(),
        kp_themes: KP_THEMES.to_string(),
        state_dir: format!("/var/lib/{name}"),
        env_file: None,
        latch_env: None,
        deny_ignore: Vec::new(),
        unit_service: Vec::new(),
        image: None,
        required_checks: Vec::new(),
        vmid: 0,
        release: Default::default(),
        name,
        description,
        latch,
    }
}

/// Writes every scaffold file, the `.chassis.toml` record and the empty
/// `docs/` and `tests/` directories.
fn write_scaffold(dir: &Path, rec: &Recorded) -> Result<(), Error> {
    for (rel, body, exec, _) in render_all(rec, &scaffold_features())? {
        let body = if rel == "Cargo.toml" {
            with_chassis_path(&body, rec)
        } else {
            body
        };
        write_file(dir, &rel, &body, exec)?;
    }
    write_file(
        dir,
        ".chassis.toml",
        &format!(
            "# Written by `chassis new`; read by `chassis sync` and `chassis release`.\n{}",
            toml::to_string_pretty(rec).expect("recorded serialises")
        ),
        false,
    )?;
    for d in ["docs", "tests"] {
        std::fs::create_dir_all(dir.join(d)).map_err(|e| io_err(&dir.join(d), e))?;
        std::fs::write(dir.join(d).join(".gitkeep"), "").map_err(|e| io_err(dir, e))?;
    }
    Ok(())
}

/// `git init`, the hooks path, the lock file and the first commit.
fn init_repository(dir: &Path) -> Result<(), Error> {
    run(dir, "git", &["init", "-q", "-b", "main"], false)?;
    run(
        dir,
        "git",
        &["config", "core.hooksPath", ".githooks"],
        false,
    )?;
    // H10: resolve the lockfile now so it is part of the first commit;
    // otherwise the first real commit's gate sees `cargo test` create it
    // and refuses (the tree changed while the checks ran). Best effort:
    // offline without a registry cache it cannot resolve, and says so.
    if let Err(e) = run(dir, "cargo", &["generate-lockfile", "-q"], false) {
        println!(
            "note: Cargo.lock not generated ({}); run `cargo generate-lockfile` and commit it before the first real commit",
            e.message.lines().next().unwrap_or("")
        );
    }
    run(dir, "git", &["add", "-A"], false)?;
    // The first commit bypasses the gates on purpose: a project has not
    // been built yet, so its own tests cannot have run; the gates hold
    // from the second commit on.
    let mut commit_args: Vec<&str> = Vec::new();
    // A machine without a git identity (a CI runner) still gets its first
    // commit; a configured identity is left alone.
    let has_identity = capture(dir, "git", &["config", "user.email"])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    if !has_identity {
        commit_args.extend([
            "-c",
            "user.name=chassis",
            "-c",
            "user.email=chassis@localhost",
        ]);
    }
    commit_args.extend([
        "commit",
        "-q",
        "--no-verify",
        "-m",
        "Project created with chassis new [meta]",
    ]);
    run(dir, "git", &commit_args, false)
}

/// Creates the GitHub repository from the new project and pushes `main`.
fn create_remote(dir: &Path, rec: &Recorded) -> Result<(), Error> {
    require_tool("gh", "install the GitHub CLI and run `gh auth login`")?;
    run(
        dir,
        "gh",
        &[
            "repo",
            "create",
            &rec.repo,
            "--public",
            "--source",
            ".",
            "--remote",
            "origin",
            "--push",
            "--description",
            &rec.description,
        ],
        false,
    )?;
    println!("created https://github.com/{} and pushed main", rec.repo);
    println!(
        "What now: `chassis sync --protect` protects main against a force-push or a deletion (no required checks: the gates run locally)."
    );
    Ok(())
}
