//! `chassis` — scaffold, sync and release for services built on the kit
//! (G2, K23, AR14).
//!
//! - `new <name>`: write a project from the scaffold, `git init`, first
//!   commit, and (unless `--no-remote`) create the GitHub repository with
//!   `gh` and push. Records its inputs in `.chassis.toml` so `sync` can
//!   render the same files again later.
//! - `sync`: render the current scaffold with the recorded inputs and show
//!   a unified diff per kit-owned file; `--write` applies; `--protect`
//!   turns on branch protection once CI has run (rule 6a).
//! - `release <version>`: bump, changelog, commit, tag, push, wait for the
//!   tag's Release run, then sign and upload with `scripts/sign-release.sh`.
//!   `--dry-run` prints every external command instead of running it.
//!
//! Every external tool is called by name and reported with a remedy when
//! missing; nothing here needs a personal access token (J2).

#![forbid(unsafe_code)]

mod templates;

use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

use chassis::Error;
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};

/// What `new` recorded and `sync`/`release` read back.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Recorded {
    name: String,
    description: String,
    repo: String,
    toolchain: String,
    chassis_tag: String,
    chassis_repo: String,
    /// A path dependency instead of the git tag (drills, local work).
    #[serde(default)]
    chassis_path: Option<String>,
    kp_themes: String,
    state_dir: String,
    #[serde(default)]
    latch: bool,
    /// Where the env file lives on the target (M2, 1.6.0). Default
    /// `/etc/<name>/<name>.env`; a migrated project records the path it
    /// was measured at (Almanac: `/appdata/almanac/almanac-config/latch.env`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    env_file: Option<String>,
    /// The latch environment `latch run --env <x>` selects (M2, 1.6.0).
    /// Default `prod`; an empty string means no `--env` at all (latch's
    /// own default, `dev`), which is how CT 112 runs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    latch_env: Option<String>,
}

impl Recorded {
    /// The env file path the deploy files name (M2).
    fn env_file(&self) -> String {
        self.env_file
            .clone()
            .unwrap_or_else(|| format!("/etc/{0}/{0}.env", self.name))
    }

    /// ` --env <x>` for the latch unit, or nothing when `latch_env` is "" (M2).
    fn latch_env_flag(&self) -> String {
        match self.latch_env.as_deref() {
            None => " --env prod".to_string(),
            Some("") => String::new(),
            Some(env) => format!(" --env {env}"),
        }
    }

    fn context(&self) -> minijinja::Value {
        let prefix = self.name.to_ascii_uppercase().replace('-', "_");
        let owner = self.repo.split('/').next().unwrap_or("").to_string();
        minijinja::context! {
            name => self.name,
            prefix => prefix,
            repo => self.repo,
            owner => owner,
            description => self.description,
            toolchain => self.toolchain,
            chassis_tag => self.chassis_tag,
            chassis_version => self.chassis_tag.trim_start_matches('v'),
            chassis_repo => self.chassis_repo,
            chassis_path => self.chassis_path,
            kp_themes => self.kp_themes,
            state_dir => self.state_dir,
            latch => self.latch,
            env_file => self.env_file(),
            latch_env_flag => self.latch_env_flag(),
            release_pubkey => RELEASE_PUBKEY,
            vmid => 0,
            stack => self.name,
        }
    }
}

/// Mirrors `chassis::shell::update::RELEASE_PUBKEY` (the shell module is
/// behind a feature the CLI does not enable); a test keeps the two equal.
const RELEASE_PUBKEY: &str = "RWQWCzzUBquIHGkS3YERMkuqEm4C3vBArnlb9rySbr8z5ytgVYuji3bS";
const TOOLCHAIN: &str = "1.97";
const KP_THEMES: &str = "3.1.0";
const CHASSIS_REPO: &str = "https://github.com/kennypassenier/chassis-rs";

#[derive(Parser)]
#[command(
    name = "chassis",
    version,
    about = "Scaffold, sync and release services built on chassis"
)]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Write a new service from the scaffold and create its repository
    New {
        /// The service's name: binary, unit, env prefix stem, state dir
        name: String,
        /// One line for Cargo.toml and the README
        #[arg(long, default_value = "A service built on chassis")]
        description: String,
        /// GitHub owner/name (default: kennypassenier/<name>)
        #[arg(long)]
        repo: Option<String>,
        /// Where to write (default: ./<name>)
        #[arg(long)]
        dir: Option<PathBuf>,
        /// Do not create or push a GitHub repository
        #[arg(long)]
        no_remote: bool,
        /// Depend on a local checkout of the kit instead of the git tag
        #[arg(long)]
        chassis_path: Option<PathBuf>,
        /// The kit tag to pin (default: this command's own version)
        #[arg(long)]
        chassis_tag: Option<String>,
        /// Also write the latch variant of the unit
        #[arg(long)]
        latch: bool,
    },
    /// Compare a project with the current scaffold; --write applies
    Sync {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        write: bool,
        /// Also rewrite project-owned files (Cargo.toml, src/main.rs, README, CHANGELOG)
        #[arg(long)]
        force: bool,
        /// Enable branch protection on main requiring the CI checks (needs gh)
        #[arg(long)]
        protect: bool,
    },
    /// Bump, tag, wait for CI, sign and upload the release
    Release {
        version: String,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        /// Print the external commands instead of running them
        #[arg(long)]
        dry_run: bool,
        /// Seconds between polls of the release run
        #[arg(long, default_value_t = 15)]
        poll_interval_secs: u64,
        /// Give up waiting for the release run after this many seconds
        #[arg(long, default_value_t = 1800)]
        max_wait_secs: u64,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let result = match cli.cmd {
        Cmd::New {
            name,
            description,
            repo,
            dir,
            no_remote,
            chassis_path,
            chassis_tag,
            latch,
        } => cmd_new(
            name,
            description,
            repo,
            dir,
            no_remote,
            chassis_path,
            chassis_tag,
            latch,
        ),
        Cmd::Sync {
            dir,
            write,
            force,
            protect,
        } => cmd_sync(&dir, write, force, protect).map(|changed| {
            if changed && !write {
                // A CI-friendly signal: differences exist and were not applied.
                std::process::exit(1);
            }
        }),
        Cmd::Release {
            version,
            dir,
            dry_run,
            poll_interval_secs,
            max_wait_secs,
        } => cmd_release(&dir, &version, dry_run, poll_interval_secs, max_wait_secs),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

// ───────────────────────── rendering ─────────────────────────

/// Every file the scaffold produces for `rec`, as (path, bytes, executable).
fn render_all(rec: &Recorded) -> Result<Vec<(String, String, bool, bool)>, Error> {
    let ctx = rec.context();
    let mut out = Vec::new();
    for e in templates::ENTRIES {
        if e.path.contains("latch") && !rec.latch {
            continue;
        }
        let path = render_str("path", e.path, &ctx)?;
        let body = if e.render {
            render_str(e.path, e.body, &ctx)?
        } else {
            e.body.to_string()
        };
        out.push((path, body, e.executable, e.project_owned));
    }
    Ok(out)
}

fn render_str(name: &str, src: &str, ctx: &minijinja::Value) -> Result<String, Error> {
    let mut env = minijinja::Environment::new();
    env.set_keep_trailing_newline(true);
    // Scaffold files are not HTML or JSON: a `.yml` template must not get
    // minijinja's JSON auto-escaping (it quoted the GitHub `${{ }}` guards).
    env.set_auto_escape_callback(|_| minijinja::AutoEscape::None);
    env.add_template(name, src)
        .and_then(|_| env.get_template(name)?.render(ctx))
        .map_err(|e| {
            Error::internal(
                format!("scaffold template {name} failed: {e}"),
                "this is a bug in the scaffold; report it with the message",
            )
        })
}

fn write_file(root: &Path, rel: &str, body: &str, executable: bool) -> Result<(), Error> {
    let path = root.join(rel);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| io_err(&path, e))?;
    }
    std::fs::write(&path, body).map_err(|e| io_err(&path, e))?;
    #[cfg(unix)]
    if executable {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| io_err(&path, e))?;
    }
    Ok(())
}

fn io_err(path: &Path, e: std::io::Error) -> Error {
    Error::config(
        format!("cannot write {}: {e}", path.display()),
        "check the directory's permissions and free space",
    )
}

/// `Cargo.toml` gets a path dependency when `--chassis-path` was given;
/// the template itself pins the git tag.
fn with_chassis_path(cargo_toml: &str, rec: &Recorded) -> String {
    match &rec.chassis_path {
        Some(p) => {
            let git_line_start = cargo_toml
                .find("chassis = { git =")
                .expect("template has the git dependency");
            let git_line_end = cargo_toml[git_line_start..]
                .find('\n')
                .map(|i| git_line_start + i)
                .unwrap_or(cargo_toml.len());
            let features_start = cargo_toml[git_line_start..git_line_end]
                .find("features =")
                .unwrap_or(0);
            let features = &cargo_toml[git_line_start + features_start..git_line_end];
            // CF-6 a: a path dependency without `version` is a wildcard to
            // cargo-deny too — the E2E found it the moment it ran the check.
            format!(
                "{}chassis = {{ path = \"{}\", version = \"{}\", {} }}{}",
                &cargo_toml[..git_line_start],
                p,
                env!("CARGO_PKG_VERSION"),
                features.trim_end_matches(" }"),
                &cargo_toml[git_line_end..]
            )
        }
        None => cargo_toml.to_string(),
    }
}

// ───────────────────────── new ─────────────────────────

#[allow(clippy::too_many_arguments)]
fn cmd_new(
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
    if dir.exists()
        && std::fs::read_dir(&dir)
            .map(|mut d| d.next().is_some())
            .unwrap_or(false)
    {
        return Err(Error::invalid(
            format!("{} exists and is not empty", dir.display()),
            "pick another --dir, or run `chassis sync` inside an existing project",
        ));
    }
    let rec = Recorded {
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
        name,
        description,
        latch,
    };
    for (rel, body, exec, _) in render_all(&rec)? {
        let body = if rel == "Cargo.toml" {
            with_chassis_path(&body, &rec)
        } else {
            body
        };
        write_file(&dir, &rel, &body, exec)?;
    }
    write_file(
        &dir,
        ".chassis.toml",
        &format!(
            "# Written by `chassis new`; read by `chassis sync` and `chassis release`.\n{}",
            toml::to_string_pretty(&rec).expect("recorded serialises")
        ),
        false,
    )?;
    for d in ["docs", "tests"] {
        std::fs::create_dir_all(dir.join(d)).map_err(|e| io_err(&dir.join(d), e))?;
        std::fs::write(dir.join(d).join(".gitkeep"), "").map_err(|e| io_err(&dir, e))?;
    }

    run(&dir, "git", &["init", "-q", "-b", "main"], false)?;
    run(
        &dir,
        "git",
        &["config", "core.hooksPath", ".githooks"],
        false,
    )?;
    // H10: resolve the lockfile now so it is part of the first commit;
    // otherwise the first real commit's gate sees `cargo test` create it
    // and refuses (the tree changed while the checks ran). Best effort:
    // offline without a registry cache it cannot resolve, and says so.
    if let Err(e) = run(&dir, "cargo", &["generate-lockfile", "-q"], false) {
        println!(
            "note: Cargo.lock not generated ({}); run `cargo generate-lockfile` and commit it before the first real commit",
            e.message.lines().next().unwrap_or("")
        );
    }
    run(&dir, "git", &["add", "-A"], false)?;
    // The first commit bypasses the gates on purpose: a project has not
    // been built yet, so its own tests cannot have run; the gates hold
    // from the second commit on.
    let mut commit_args: Vec<&str> = Vec::new();
    // A machine without a git identity (a CI runner) still gets its first
    // commit; a configured identity is left alone.
    let has_identity = capture(&dir, "git", &["config", "user.email"])
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
    run(&dir, "git", &commit_args, false)?;
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
        require_tool("gh", "install the GitHub CLI and run `gh auth login`")?;
        run(
            &dir,
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
            "What now: after the first CI run is green, `chassis sync --protect` turns on branch protection (rule 6a)."
        );
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

/// S8: `repo` and `description` are rendered into TOML, bash, a systemd
/// unit and a Rust doc comment with autoescape off, so they are checked
/// for the shapes those contexts can take, not trusted.
fn validate_repo(repo: &str) -> Result<(), Error> {
    let ok = repo.split_once('/').is_some_and(|(o, n)| {
        !o.is_empty()
            && !n.is_empty()
            && [o, n].iter().all(|p| {
                p.chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
            })
    });
    if ok {
        Ok(())
    } else {
        Err(Error::invalid(
            format!("`{repo}` is not a GitHub owner/name"),
            "use letters, digits, `_`, `.` and `-` on both sides of one slash, e.g. kennypassenier/inbox",
        ))
    }
}

fn validate_description(description: &str) -> Result<(), Error> {
    let ok = (1..=120).contains(&description.chars().count())
        && !description
            .chars()
            .any(|c| c.is_control() || matches!(c, '"' | '\\' | '`' | '$' | '{' | '}'));
    if ok {
        Ok(())
    } else {
        Err(Error::invalid(
            "the description must be one plain line",
            "1-120 characters, no newline, quote, backslash, backtick, `$` or braces (it lands in Cargo.toml, the unit and a doc comment)",
        ))
    }
}

fn validate_name(name: &str) -> Result<(), Error> {
    let ok = (1..=32).contains(&name.len())
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && name.chars().next().is_some_and(|c| c.is_ascii_lowercase());
    if ok {
        Ok(())
    } else {
        Err(Error::invalid(
            format!("`{name}` is not a valid service name"),
            "use 1-32 lowercase letters, digits and dashes, starting with a letter (it becomes the binary, unit and env prefix)",
        ))
    }
}

// ───────────────────────── sync ─────────────────────────

fn read_recorded(dir: &Path) -> Result<Recorded, Error> {
    let path = dir.join(".chassis.toml");
    let text = std::fs::read_to_string(&path).map_err(|e| {
        Error::config(
            format!("cannot read {}: {e}", path.display()),
            "run `chassis sync` inside a project created with `chassis new`, or write .chassis.toml by hand (see the scaffold README)",
        )
    })?;
    toml::from_str(&text)
        .map_err(|e| Error::config(format!(".chassis.toml does not parse: {e}"), "fix the file"))
}

/// The line under which a project keeps its own `.gitignore` entries.
const GITIGNORE_MARKER: &str = "# --- project additions below (kept by chassis sync) ---";

/// M3 (1.6.0): `.gitignore` is kit-owned, but everything a project wrote
/// under the marker survives a sync — Almanac's guard against a compiled
/// binary in the repository root would otherwise have gone with the first
/// `sync --write`.
fn merge_gitignore(scaffold: &str, current: &str) -> String {
    let Some(tail) = current.split_once(GITIGNORE_MARKER).map(|(_, t)| t) else {
        return scaffold.to_string();
    };
    let tail = tail.trim_matches('\n');
    if tail.is_empty() {
        return scaffold.to_string();
    }
    format!(
        "{}{tail}\n",
        scaffold.trim_end_matches('\n').to_string() + "\n"
    )
}

/// Returns whether any kit-owned file differed.
fn cmd_sync(dir: &Path, write: bool, force: bool, protect: bool) -> Result<bool, Error> {
    let rec = read_recorded(dir)?;
    let mut changed = false;
    for (rel, body, exec, owned) in render_all(&rec)? {
        let current = std::fs::read_to_string(dir.join(&rel)).unwrap_or_default();
        let body = if rel == "Cargo.toml" {
            with_chassis_path(&body, &rec)
        } else if rel == ".gitignore" {
            merge_gitignore(&body, &current)
        } else {
            body
        };
        if current == body {
            continue;
        }
        if owned && !force {
            println!(
                "~ {rel} (project-owned; differs from the scaffold, left alone — use --write --force to overwrite)"
            );
            continue;
        }
        changed = true;
        let diff = similar::TextDiff::from_lines(&current, &body);
        println!("--- {rel} (project)\n+++ {rel} (scaffold)");
        for hunk in diff.unified_diff().context_radius(2).iter_hunks() {
            print!("{hunk}");
        }
        if write {
            write_file(dir, &rel, &body, exec)?;
            println!("  written");
        }
    }
    if !changed {
        println!(
            "in sync with the scaffold of chassis {}",
            env!("CARGO_PKG_VERSION")
        );
    }
    if protect {
        protect_main(&rec)?;
    }
    Ok(changed)
}

fn protect_main(rec: &Recorded) -> Result<(), Error> {
    require_tool("gh", "install the GitHub CLI and run `gh auth login`")?;
    let body = serde_json::json!({
        "required_status_checks": { "strict": true, "contexts": ["fmt · clippy · tests", "cargo-deny (advisories · licenses · bans)", "container build"] },
        "enforce_admins": true,
        "required_pull_request_reviews": null,
        "restrictions": null,
        "allow_force_pushes": false,
        "allow_deletions": false
    });
    let endpoint = format!("repos/{}/branches/main/protection", rec.repo);
    let out = Command::new("gh")
        .args(["api", "-X", "PUT", &endpoint, "--input", "-"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write;
            child
                .stdin
                .take()
                .expect("stdin")
                .write_all(body.to_string().as_bytes())?;
            child.wait_with_output()
        })
        .map_err(|e| {
            Error::dependency(
                format!("gh api failed: {e}"),
                "is gh installed and logged in?",
            )
        })?;
    if !out.status.success() {
        return Err(Error::dependency(
            format!(
                "branch protection was refused: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ),
            "the CI checks must have run at least once on this repository first (rule 6a); push a commit and retry",
        ));
    }
    // Rule 13a: read it back.
    let read = Command::new("gh")
        .args(["api", &endpoint, "--jq", ".required_status_checks.contexts"])
        .output()
        .map_err(|e| Error::dependency(format!("gh api failed: {e}"), "retry"))?;
    println!(
        "branch protection on {} main now requires: {}",
        rec.repo,
        String::from_utf8_lossy(&read.stdout).trim()
    );
    Ok(())
}

// ───────────────────────── release ─────────────────────────

fn cmd_release(
    dir: &Path,
    version: &str,
    dry_run: bool,
    poll_interval: u64,
    max_wait: u64,
) -> Result<(), Error> {
    let rec = read_recorded(dir)?;
    check_release_files(dir)?;
    let v = chassis::core::update::Version::parse(version)?;
    let tag = format!("v{v}");
    if !dry_run {
        require_tool("git", "install git")?;
        require_tool("gh", "install the GitHub CLI and run `gh auth login`")?;
        require_tool(
            "minisign",
            "install minisign (the signing key stays on this machine)",
        )?;
        let status = capture(dir, "git", &["status", "--porcelain"])?;
        if !status.trim().is_empty() {
            return Err(Error::invalid(
                "the working tree is not clean",
                "commit or stash first; a release is cut from a committed tree",
            ));
        }
        let branch = capture(dir, "git", &["rev-parse", "--abbrev-ref", "HEAD"])?;
        if branch.trim() != "main" {
            return Err(Error::invalid(
                format!("on branch `{}`, not main", branch.trim()),
                "release from main so the tag lands on the mainline (PROCEDURE: tag the merge commit)",
            ));
        }
    }

    // 1. Bump Cargo.toml and the changelog.
    let cargo_path = dir.join("Cargo.toml");
    let cargo = std::fs::read_to_string(&cargo_path).map_err(|e| io_err(&cargo_path, e))?;
    let current = current_version(&cargo)?;
    let bumped = bump_version(&cargo, &v.to_string())?;
    let changelog_path = dir.join("CHANGELOG.md");
    let changelog = std::fs::read_to_string(&changelog_path).unwrap_or_default();
    check_major_has_migration(&changelog, current, v)?;
    let dated = release_changelog(&changelog, &v.to_string(), &today());
    let steps = [
        format!("git commit -am 'chore(release): {v} [meta]'"),
        format!(
            "git push origin HEAD:refs/heads/release-{v}   # CI must be green before main moves (rule 6)"
        ),
        format!(
            "wait for the checks of that commit, then: git push origin HEAD:main && git push origin --delete release-{v}"
        ),
        format!("git tag {tag} && git push origin {tag}"),
        format!(
            "wait for the Release workflow run whose head_branch == {tag} (poll every {poll_interval}s, at most {max_wait}s)"
        ),
        format!(
            "scripts/sign-release.sh {tag}   # minisign asks for the key password; uploads .minisig then VERSION"
        ),
    ];
    if dry_run {
        println!(
            "checked: .chassis.toml present · Dockerfile present where release.yml builds an image · Migration section on a major"
        );
        println!(
            "dry run: would write Cargo.toml version = \"{v}\" and a {v} section in CHANGELOG.md, then:"
        );
        for s in &steps {
            println!("  {s}");
        }
        return Ok(());
    }
    std::fs::write(&cargo_path, bumped).map_err(|e| io_err(&cargo_path, e))?;
    std::fs::write(&changelog_path, dated).map_err(|e| io_err(&changelog_path, e))?;
    // The lock file must carry the new version or the gates refuse the tree (rule 7).
    run(dir, "cargo", &["update", "-w", "--offline"], true)
        .or_else(|_| run(dir, "cargo", &["update", "-w"], false))?;

    // 2. Commit through the gates, push a work branch, wait, fast-forward.
    run(
        dir,
        "git",
        &["commit", "-qam", &format!("chore(release): {v} [meta]")],
        false,
    )?;
    let sha = capture(dir, "git", &["rev-parse", "HEAD"])?
        .trim()
        .to_string();
    let work = format!("release-{v}");
    run(
        dir,
        "git",
        &["push", "-q", "origin", &format!("HEAD:refs/heads/{work}")],
        false,
    )?;
    println!("pushed {sha} as {work}; waiting for its checks");
    wait_for_checks(&rec.repo, &sha, poll_interval, max_wait)?;
    run(dir, "git", &["push", "-q", "origin", "HEAD:main"], false)?;
    let _ = run(
        dir,
        "git",
        &["push", "-q", "origin", "--delete", &work],
        true,
    );

    // 3. Tag the commit on main, push the tag, wait for the Release run.
    run(dir, "git", &["tag", &tag], false)?;
    run(dir, "git", &["push", "-q", "origin", &tag], false)?;
    println!(
        "tagged {tag}; waiting for the Release workflow (critic #15: by head_branch, never by sha)"
    );
    wait_for_release_run(&rec.repo, &tag, poll_interval, max_wait)?;

    // 4. Sign locally and upload .minisig before VERSION.
    run(dir, "scripts/sign-release.sh", &[&tag], false)?;
    println!("released {} {tag}", rec.name);
    Ok(())
}

fn current_version(cargo_toml: &str) -> Result<chassis::core::update::Version, Error> {
    let mut in_package = false;
    for line in cargo_toml.lines() {
        if line.trim_start().starts_with('[') {
            in_package = line.trim() == "[package]";
        }
        if in_package
            && line.trim_start().starts_with("version")
            && let Some(v) = line.split('"').nth(1)
        {
            return chassis::core::update::Version::parse(v);
        }
    }
    Err(Error::config(
        "Cargo.toml has no [package] version line",
        "add `version = \"x.y.z\"` under [package]",
    ))
}

/// CF-6 (2026-09-06): the release must satisfy the workflow it is about to
/// trigger. kyu-runner's first v0.2.0 run failed on a Dockerfile that the
/// image job expected and the repository did not have — one tag deleted and
/// re-created. So: when `.github/workflows/release.yml` builds an image, a
/// `Dockerfile` must exist, and the dry run says so before any tag.
fn check_release_files(dir: &Path) -> Result<(), Error> {
    let workflow = dir.join(".github/workflows/release.yml");
    let builds_image = std::fs::read_to_string(&workflow)
        .map(|w| w.contains("build-push-action") || w.contains("docker build"))
        .unwrap_or(false);
    if builds_image && !dir.join("Dockerfile").exists() {
        return Err(Error::config(
            "release.yml builds a container image but the repository has no Dockerfile",
            "run `chassis sync --write` to add the scaffold Dockerfile (and .dockerignore), or remove the image job from release.yml",
        ));
    }
    Ok(())
}

/// K25 / H3: a major bump ships with a migration note under Unreleased.
fn check_major_has_migration(
    changelog: &str,
    current: chassis::core::update::Version,
    next: chassis::core::update::Version,
) -> Result<(), Error> {
    if next.major > current.major && !changelog.contains("Migration") {
        return Err(Error::invalid(
            format!(
                "{next} is a major bump over {current} but CHANGELOG.md has no Migration section"
            ),
            "add `### Migration` under [Unreleased] saying what an operator or consumer must change, then release again",
        ));
    }
    Ok(())
}

fn bump_version(cargo_toml: &str, version: &str) -> Result<String, Error> {
    let mut out = String::new();
    let mut done = false;
    let mut in_package = false;
    for line in cargo_toml.lines() {
        if line.trim_start().starts_with('[') {
            in_package = line.trim() == "[package]";
        }
        if in_package && !done && line.trim_start().starts_with("version") {
            out.push_str(&format!("version = \"{version}\"\n"));
            done = true;
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }
    if !done {
        return Err(Error::config(
            "Cargo.toml has no [package] version line",
            "add `version = \"x.y.z\"` under [package]",
        ));
    }
    Ok(out)
}

fn release_changelog(changelog: &str, version: &str, date: &str) -> String {
    let heading = format!("## [{version}] - {date}");
    if changelog.contains("## [Unreleased]") {
        changelog.replacen(
            "## [Unreleased]",
            &format!("## [Unreleased]\n\n{heading}"),
            1,
        )
    } else {
        format!("{changelog}\n{heading}\n")
    }
}

fn today() -> String {
    chrono_free_today()
}

/// The date without pulling chrono into the CLI: the epoch arithmetic
/// is enough for a changelog heading.
fn chrono_free_today() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86_400;
    // Civil-from-days (Howard Hinnant), valid for the range we care about.
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

fn wait_for_checks(repo: &str, sha: &str, poll: u64, max_wait: u64) -> Result<(), Error> {
    let started = std::time::Instant::now();
    loop {
        let out = capture(
            Path::new("."),
            "gh",
            &[
                "api",
                &format!("repos/{repo}/commits/{sha}/check-runs"),
                "--jq",
                "[.check_runs[] | {name, status, conclusion}]",
            ],
        )?;
        let runs: Vec<serde_json::Value> = serde_json::from_str(&out).unwrap_or_default();
        let required: Vec<&serde_json::Value> = runs
            .iter()
            .filter(|r| !r["name"].as_str().unwrap_or("").contains("informational"))
            .collect();
        let all_done = !required.is_empty() && required.iter().all(|r| r["status"] == "completed");
        if all_done {
            if required.iter().all(|r| r["conclusion"] == "success") {
                return Ok(());
            }
            return Err(Error::dependency(
                format!("a required check failed on {sha}: {out}"),
                "fix it, commit, and run `chassis release` again; the tag was not pushed",
            ));
        }
        if started.elapsed().as_secs() > max_wait {
            return Err(Error::dependency(
                format!("checks on {sha} did not finish within {max_wait}s"),
                "look at the Actions tab; rerun `chassis release` once they are green",
            ));
        }
        std::thread::sleep(std::time::Duration::from_secs(poll));
    }
}

fn wait_for_release_run(repo: &str, tag: &str, poll: u64, max_wait: u64) -> Result<(), Error> {
    let started = std::time::Instant::now();
    loop {
        let out = capture(
            Path::new("."),
            "gh",
            &[
                "run",
                "list",
                "--repo",
                repo,
                "--workflow",
                "Release",
                "--branch",
                tag,
                "--limit",
                "1",
                "--json",
                "status,conclusion",
            ],
        )?;
        let runs: Vec<serde_json::Value> = serde_json::from_str(&out).unwrap_or_default();
        if let Some(r) = runs.first()
            && r["status"] == "completed"
        {
            if r["conclusion"] == "success" {
                return Ok(());
            }
            return Err(Error::dependency(
                format!("the Release run for {tag} ended with {}", r["conclusion"]),
                "open the Actions tab, fix the workflow or the build, and re-run the workflow for the tag; then run `scripts/sign-release.sh` by hand",
            ));
        }
        if started.elapsed().as_secs() > max_wait {
            return Err(Error::dependency(
                format!("no completed Release run for {tag} within {max_wait}s"),
                "check the Actions tab; when the run is green, `scripts/sign-release.sh` finishes the release",
            ));
        }
        std::thread::sleep(std::time::Duration::from_secs(poll));
    }
}

// ───────────────────────── processes ─────────────────────────

fn require_tool(tool: &str, remedy: &str) -> Result<(), Error> {
    // `--version` for most tools; minisign 0.12 only knows `-v` and exits 2
    // on `--version`, which made `chassis release` refuse a machine that
    // had it (2026-09-06).
    let answers = |flag: &str| {
        Command::new(tool)
            .arg(flag)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    };
    if answers("--version") || answers("-v") {
        Ok(())
    } else {
        Err(Error::config(
            format!("`{tool}` is not available on this machine"),
            remedy.to_string(),
        ))
    }
}

fn run(dir: &Path, program: &str, args: &[&str], quiet: bool) -> Result<(), Error> {
    let out = Command::new(program)
        .args(args)
        .current_dir(dir)
        .stdin(std::process::Stdio::inherit())
        .output()
        .map_err(|e| {
            Error::dependency(
                format!("cannot run {program}: {e}"),
                format!("is {program} installed and on PATH?"),
            )
        })?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(Error::dependency(
            format!("{program} {} failed: {stderr}", args.join(" ")),
            "read the message above; nothing after this step ran",
        ));
    }
    if !quiet {
        let so = String::from_utf8_lossy(&out.stdout);
        if !so.trim().is_empty() {
            print!("{so}");
        }
    }
    Ok(())
}

fn capture(dir: &Path, program: &str, args: &[&str]) -> Result<String, Error> {
    let out = Command::new(program)
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| {
            Error::dependency(
                format!("cannot run {program}: {e}"),
                format!("is {program} installed and on PATH?"),
            )
        })?;
    if !out.status.success() {
        return Err(Error::dependency(
            format!(
                "{program} {} failed: {}",
                args.join(" "),
                String::from_utf8_lossy(&out.stderr).trim()
            ),
            "read the message above",
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec() -> Recorded {
        Recorded {
            name: "demo-svc".into(),
            description: "A demo".into(),
            repo: "kennypassenier/demo-svc".into(),
            toolchain: TOOLCHAIN.into(),
            chassis_tag: "v0.1.0".into(),
            chassis_repo: CHASSIS_REPO.into(),
            chassis_path: None,
            kp_themes: KP_THEMES.into(),
            state_dir: "/var/lib/demo-svc".into(),
            latch: false,
            env_file: None,
            latch_env: None,
        }
    }

    /// M2 / critic #4: the latch variant of the unit lets the child's READY
    /// through and runs --check under latch's secrets, and the binary lives
    /// in its own directory (S2).
    #[test]
    fn latch_unit_has_notify_access_all_and_checks_under_latch() {
        let mut r = rec();
        r.latch = true;
        let files = render_all(&r).unwrap();
        let unit = files
            .iter()
            .find(|(p, ..)| p == "deploy/demo-svc-latch.service")
            .map(|(_, b, ..)| b.clone())
            .expect("latch unit rendered");
        assert!(unit.contains("NotifyAccess=all"), "{unit}");
        assert!(
            unit.contains("ExecStartPre=/usr/local/bin/latch run --env prod -- /opt/demo-svc/bin/demo-svc --check"),
            "{unit}"
        );
        assert!(
            unit.contains(
                "ReadWritePaths=/var/lib/demo-svc /var/lib/demo-svc-pre-update /opt/demo-svc/bin"
            ),
            "{unit}"
        );
        assert!(
            !unit.contains("/usr/local/bin/demo-svc"),
            "the service never lives in the shared bin dir (S2)"
        );
        assert!(validate_repo("kennypassenier/inbox").is_ok());
        assert!(validate_repo("no-slash").is_err());
        assert!(validate_repo("a/b; rm -rf").is_err());
        assert!(validate_description("A service built on chassis").is_ok());
        assert!(validate_description("two\nlines").is_err());
        assert!(validate_description("has \"quotes\"").is_err());
    }

    #[test]
    fn every_template_renders_and_substitutes() {
        let files = render_all(&rec()).unwrap();
        let expected = templates::ENTRIES
            .iter()
            .filter(|e| !e.path.contains("latch"))
            .count();
        assert_eq!(
            files.len(),
            expected,
            "every non-latch entry renders exactly once"
        );
        let get = |p: &str| {
            files
                .iter()
                .find(|(path, ..)| path == p)
                .map(|(_, b, ..)| b.clone())
                .unwrap_or_else(|| panic!("{p} missing"))
        };
        assert!(get("Cargo.toml").contains("name = \"demo-svc\""));
        assert!(get("Cargo.toml").contains("tag = \"v0.1.0\""));
        assert!(
            get("deploy/demo-svc.service")
                .contains("ExecStartPre=/opt/demo-svc/bin/demo-svc --check")
        );
        assert!(
            get("deploy/demo-svc.service").contains("StartLimitIntervalSec=0"),
            "in [Unit]"
        );
        assert!(
            get("deploy/service.yml").contains("update_cmd:")
                && get("deploy/service.yml").contains("--wait --pipe --collect")
        );
        assert!(get("Dockerfile").contains("DEMO_SVC_LISTEN"));
        let release_yml = get(".github/workflows/release.yml");
        let token_lines: Vec<&str> = release_yml
            .lines()
            .filter(|l| l.contains("GITHUB_TOKEN") || l.contains("github.actor"))
            .collect();
        assert!(
            release_yml.contains("${{ secrets.GITHUB_TOKEN }}"),
            "GitHub expressions survive the template engine: {token_lines:?}"
        );
        assert!(get("scripts/sign-release.sh").contains(RELEASE_PUBKEY));
        assert!(
            !files.iter().any(|(p, ..)| p.contains("latch")),
            "latch unit only on request"
        );
        let files = render_all(&Recorded {
            latch: true,
            ..rec()
        })
        .unwrap();
        assert!(
            files
                .iter()
                .any(|(p, ..)| p == "deploy/demo-svc-latch.service")
        );
    }

    #[test]
    fn release_pubkey_matches_the_kit() {
        // The CLI does not enable the kit's self-update feature, so it
        // mirrors the constant; this keeps the two from drifting.
        let kit = include_str!("../../chassis/src/shell/update.rs");
        assert!(kit.contains(&format!(
            "pub const RELEASE_PUBKEY: &str = \"{RELEASE_PUBKEY}\""
        )));
    }

    #[test]
    fn a_tool_that_only_answers_dash_v_counts_as_available() {
        // minisign 0.12 exits 2 on `--version` and 0 on `-v`; `chassis release`
        // refused a machine that had it installed (2026-09-06).
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let tool = dir.path().join("fake-minisign");
        std::fs::write(&tool, "#!/bin/sh\n[ \"$1\" = \"-v\" ] && exit 0\nexit 2\n").unwrap();
        std::fs::set_permissions(&tool, std::fs::Permissions::from_mode(0o755)).unwrap();
        require_tool(tool.to_str().unwrap(), "install it").expect("-v is enough");
        let absent = dir.path().join("absent");
        assert!(require_tool(absent.to_str().unwrap(), "install it").is_err());
    }

    #[test]
    fn the_git_dependency_pins_a_version_next_to_its_tag() {
        // cargo-deny's `wildcards = "deny"` flags a git dependency without a
        // version requirement; the first remote `chassis new` was red on it
        // (2026-09-06), as kyu-runner's migration had already found by hand.
        let cargo = render_all(&rec())
            .unwrap()
            .into_iter()
            .find(|(p, ..)| p == "Cargo.toml")
            .unwrap()
            .1;
        assert!(
            cargo.contains("tag = \"v0.1.0\", version = \"0.1.0\", features = ["),
            "{cargo}"
        );
    }

    #[test]
    fn chassis_path_replaces_the_git_dependency() {
        let cargo = render_all(&rec())
            .unwrap()
            .into_iter()
            .find(|(p, ..)| p == "Cargo.toml")
            .unwrap()
            .1;
        let local = with_chassis_path(
            &cargo,
            &Recorded {
                chassis_path: Some("/tmp/kit".into()),
                ..rec()
            },
        );
        assert!(
            local.contains(&format!(
                "chassis = {{ path = \"/tmp/kit\", version = \"{}\", features = [",
                env!("CARGO_PKG_VERSION")
            )),
            "{local}"
        );
        assert!(!local.contains("git ="));
    }

    #[test]
    fn names_versions_and_changelog() {
        assert!(validate_name("inbox").is_ok());
        assert!(validate_name("Inbox").is_err());
        assert!(validate_name("1st").is_err());
        assert!(validate_name("a_b").is_err());
        let bumped = bump_version(
            "[package]\nname = \"x\"\nversion = \"0.1.0\"\n\n[dependencies]\nversion = \"9\"\n",
            "0.2.0",
        )
        .unwrap();
        assert!(bumped.contains("version = \"0.2.0\"") && bumped.contains("version = \"9\""));
        let cl = release_changelog(
            "# Changelog\n\n## [Unreleased]\n\n### Added\n- x\n",
            "0.2.0",
            "2026-09-05",
        );
        assert!(cl.contains("## [Unreleased]\n\n## [0.2.0] - 2026-09-05"));
        assert_eq!(chrono_free_today().len(), 10);
    }

    #[test]
    fn major_bumps_need_a_migration_note() {
        let v = |s: &str| chassis::core::update::Version::parse(s).unwrap();
        assert_eq!(
            current_version("[package]\nversion = \"1.2.3\"\n").unwrap(),
            v("1.2.3")
        );
        assert!(
            check_major_has_migration("## [Unreleased]\n- x\n", v("1.2.3"), v("1.3.0")).is_ok()
        );
        assert!(
            check_major_has_migration("## [Unreleased]\n- x\n", v("1.2.3"), v("2.0.0")).is_err(),
            "major without Migration is refused"
        );
        assert!(
            check_major_has_migration(
                "## [Unreleased]\n### Migration\n- rename X\n",
                v("1.2.3"),
                v("2.0.0")
            )
            .is_ok()
        );
    }

    #[test]
    fn new_writes_a_project_that_syncs_clean() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("demo-svc");
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
        assert!(target.join(".chassis.toml").exists());
        assert!(target.join(".git").exists());
        assert!(target.join(".github/workflows/ci.yml").exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert!(
                std::fs::metadata(target.join(".githooks/pre-commit"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o111
                    != 0
            );
        }
        // Freshly generated: zero diffs.
        assert!(
            !cmd_sync(&target, false, false, false).unwrap(),
            "no differences right after new"
        );
        // A drifted kit file is reported and --write repairs it.
        std::fs::write(target.join("deny.toml"), "# drifted\n").unwrap();
        assert!(cmd_sync(&target, false, false, false).unwrap());
        assert!(cmd_sync(&target, true, false, false).unwrap());
        assert!(!cmd_sync(&target, false, false, false).unwrap());
        // A project-owned file is left alone.
        std::fs::write(target.join("src/main.rs"), "fn main() {}\n").unwrap();
        assert!(
            !cmd_sync(&target, false, false, false).unwrap(),
            "owned files do not count as drift"
        );
        assert_eq!(
            std::fs::read_to_string(target.join("src/main.rs")).unwrap(),
            "fn main() {}\n"
        );
    }

    #[test]
    fn a_release_workflow_that_builds_an_image_needs_a_dockerfile() {
        let dir = std::env::temp_dir().join(format!("chassis-cf6-{}", std::process::id()));
        let wf = dir.join(".github/workflows");
        std::fs::create_dir_all(&wf).unwrap();
        std::fs::write(
            wf.join("release.yml"),
            "steps:\n  - uses: docker/build-push-action@sha # v6\n",
        )
        .unwrap();
        let err = check_release_files(&dir).unwrap_err();
        assert!(err.to_string().contains("no Dockerfile"), "{err}");
        std::fs::write(dir.join("Dockerfile"), "FROM scratch\n").unwrap();
        check_release_files(&dir).unwrap();
        // A workflow without an image job needs no Dockerfile.
        std::fs::remove_file(dir.join("Dockerfile")).unwrap();
        std::fs::write(wf.join("release.yml"), "steps:\n  - run: cargo build\n").unwrap();
        check_release_files(&dir).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// M3: project entries under the marker survive a sync.
    #[test]
    fn gitignore_additions_under_the_marker_survive_a_sync() {
        let scaffold = format!("/target/\n\n{GITIGNORE_MARKER}\n");
        let current = format!("/old/\n{GITIGNORE_MARKER}\n/almanac\n/cal-stacean\n");
        let merged = merge_gitignore(&scaffold, &current);
        assert_eq!(
            merged,
            format!("/target/\n\n{GITIGNORE_MARKER}\n/almanac\n/cal-stacean\n")
        );
        assert_eq!(
            merge_gitignore(&scaffold, "/old/\n"),
            scaffold,
            "no marker: the scaffold wins"
        );
        assert_eq!(
            merge_gitignore(&scaffold, &scaffold),
            scaffold,
            "an empty tail adds nothing"
        );
    }

    /// M2: a migrated project records the paths it was measured at and the
    /// deploy files render them — CT 112's layout, byte for byte.
    #[test]
    fn measured_env_file_and_latch_env_reach_the_deploy_files() {
        let mut r = rec();
        r.latch = true;
        r.env_file = Some("/appdata/demo-svc/demo-svc-config/latch.env".into());
        r.latch_env = Some(String::new());
        let files = render_all(&r).unwrap();
        let unit = &files
            .iter()
            .find(|(p, ..)| p == "deploy/demo-svc-latch.service")
            .unwrap()
            .1;
        assert!(
            unit.contains("EnvironmentFile=/appdata/demo-svc/demo-svc-config/latch.env"),
            "{unit}"
        );
        assert!(
            unit.contains("ExecStart=/usr/local/bin/latch run -- /opt/demo-svc/bin/demo-svc\n"),
            "{unit}"
        );
        let stack = &files
            .iter()
            .find(|(p, ..)| p == "deploy/service.yml")
            .unwrap()
            .1;
        assert!(
            stack.contains("env_file: /appdata/demo-svc/demo-svc-config/latch.env"),
            "{stack}"
        );
        assert!(
            stack
                .contains("--property=EnvironmentFile=/appdata/demo-svc/demo-svc-config/latch.env"),
            "{stack}"
        );
        // The defaults are what a fresh project always got.
        let fresh = render_all(&rec()).unwrap();
        let unit = &fresh
            .iter()
            .find(|(p, ..)| p == "deploy/demo-svc.service")
            .unwrap()
            .1;
        assert!(
            unit.contains("EnvironmentFile=/etc/demo-svc/demo-svc.env"),
            "{unit}"
        );
        // M1: the gates call the project's own hook when it exists.
        let gates = &fresh
            .iter()
            .find(|(p, ..)| p == ".claude/hooks/gates.sh")
            .unwrap()
            .1;
        assert!(gates.contains("gates.project.sh"), "{gates}");
        let ci = &fresh
            .iter()
            .find(|(p, ..)| p == ".github/workflows/ci.yml")
            .unwrap()
            .1;
        assert!(ci.contains("gates.project.sh"), "{ci}");
    }
}
