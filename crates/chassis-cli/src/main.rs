//! `chassis` — scaffold, sync and release for services built on the kit
//! (G2, K23, AR14).
//!
//! - `new <name>`: write a project from the scaffold, `git init`, first
//!   commit, and (unless `--no-remote`) create the GitHub repository with
//!   `gh` and push. Records its inputs in `.chassis.toml` so `sync` can
//!   render the same files again later.
//! - `sync`: render the current scaffold with the recorded inputs and show
//!   a unified diff per kit-owned file, then report the drift that is not a
//!   file (K32: kit tag vs `Cargo.toml`, `kp_themes` vs what the kit
//!   vendors, and with `--remote` branch protection vs the CI job names);
//!   `--write` applies; `--protect` turns on branch protection once CI has
//!   run (rule 6a).
//! - `release <version>`: bump, changelog, commit, tag, push, wait for the
//!   tag's Release run, then sign and upload with `scripts/sign-release.sh`.
//!   `--dry-run` prints every external command instead of running it.
//! - `clients <verb>`: manage a running service's client tokens over its
//!   own `/api/clients` (K30), for services without a dashboard operator
//!   at hand; see `clients.rs`.
//!
//! Every external tool is called by name and reported with a remedy when
//! missing; nothing here needs a personal access token (J2).

#![forbid(unsafe_code)]

mod clients;
mod drift;
mod kit_docs;
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
    /// RUSTSEC ids cargo-deny may ignore for this project (1.7.0), each a
    /// reviewed decision with its reason in this file's comments; rendered
    /// into the kit-owned `deny.toml`, so a sync keeps them.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    deny_ignore: Vec<String>,
    /// The LXC's vmid (1.7.1): `service.yml` names it and the hostname
    /// `<vmid>-app-<name>` the homelab validates. 0 = not adopted yet.
    #[serde(default)]
    vmid: u32,
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

    /// `features` names the kit features the project's binary is built
    /// with (K35): `new` writes them into the Cargo.toml it generates,
    /// `sync` reads them back from the project's own.
    fn context(&self, features: &[String]) -> minijinja::Value {
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
            deny_ignore => self.deny_ignore.clone(),
            release_pubkey => RELEASE_PUBKEY,
            vmid => self.vmid,
            stack => self.name,
            // K27/K31: pre-rendered so docs/KIT.md always carries the
            // kit's own table, and K35: only the rows this project's
            // binary can act on.
            knobs_table => kit_docs::knobs_markdown(&self.name, features),
            features => features.to_vec(),
            features_sentence => features.join(", "),
            chassis_features_literal => features
                .iter()
                .filter(|f| *f != "core" && *f != "assets")
                .map(|f| format!("\"{f}\""))
                .collect::<Vec<_>>()
                .join(", "),
        }
    }
}

/// Mirrors `chassis::shell::update::RELEASE_PUBKEY` (the shell module is
/// behind a feature the CLI does not enable); a test keeps the two equal.
const RELEASE_PUBKEY: &str = "RWQWCzzUBquIHGkS3YERMkuqEm4C3vBArnlb9rySbr8z5ytgVYuji3bS";

/// What `chassis new` puts on the kit dependency it writes (K35): the
/// generated Cargo.toml and the generated documentation are rendered from
/// this one list, so a new project cannot start out with a document that
/// describes other features than it builds.
///
/// `passkeys` is not on it (feat-build-1). It pulls OpenSSL, which the
/// static musl release build would have to vendor and compile per release,
/// and no consumer builds it: kyu, Almanac and HTTPSwitchboard run
/// core + dashboard + self-update, kyu-runner core + self-update. A
/// project that needs passkeys adds the feature and builds against glibc.
fn scaffold_features() -> Vec<String> {
    ["core", "dashboard", "assets", "self-update", "notify"]
        .iter()
        .map(|f| (*f).to_string())
        .collect()
}
const TOOLCHAIN: &str = "1.97";
const KP_THEMES: &str = "5.1.0";
const CHASSIS_REPO: &str = "https://github.com/kennypassenier/chassis-rs";

#[derive(Parser)]
#[command(
    name = "chassis",
    version,
    about = "Scaffold, sync and release services built on chassis; manage a running service's client tokens"
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
        /// Also compare main's branch protection with the CI job names (needs gh; sync is offline without it)
        #[arg(long)]
        remote: bool,
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
    /// Move a project to another kit version: the record, both dependency lines, cargo, the gates
    #[command(
        long_about = "Move a project to another kit version in one step (feat-sync-1). The kit version lives in three places — `chassis_tag` in .chassis.toml, the `chassis` dependency and the dev-dependency that carries the test harness — and `chassis sync` reports a difference between them but never writes Cargo.toml, which the project owns. This aligns all three, updates the lock file and runs the project's own gates, so an upgrade is one command instead of three edits."
    )]
    Upgrade {
        /// The kit version to move to, with or without the leading v
        version: String,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        /// Change the files and stop: no cargo update, no gates
        #[arg(long)]
        no_verify: bool,
    },
    /// Manage a running service's client tokens without a browser (list, issue, reissue, revoke, delete, reveal)
    #[command(
        long_about = "Manage a running service's client tokens without a browser, over the same /api/clients the dashboard uses: list, issue, reissue, revoke, delete, reveal. For a headless service (http-switchboard, kyu-runner) that needs a token for a client such as Alertmanager."
    )]
    Clients(clients::ClientsArgs),
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
            remote,
        } => cmd_sync(&dir, write, force, protect, remote).map(|outcome| {
            if outcome.unresolved {
                // A CI-friendly signal: a difference is still there — not
                // applied, or one --write cannot apply (D1).
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
        Cmd::Upgrade {
            version,
            dir,
            no_verify,
        } => cmd_upgrade(&dir, &version, no_verify),
        Cmd::Clients(args) => clients::run(args),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

// ───────────────────────── upgrade ─────────────────────────

/// `chassis upgrade <version>` (feat-sync-1): the kit version in one step.
///
/// Why a command of its own rather than `sync --write`: Cargo.toml belongs to
/// the project, and that boundary is one the consumers name as a reason to
/// trust sync. This touches exactly the lines that carry the kit's version
/// and nothing else in the file.
fn cmd_upgrade(dir: &Path, version: &str, no_verify: bool) -> Result<(), Error> {
    let tag = if version.starts_with('v') {
        version.to_string()
    } else {
        format!("v{version}")
    };

    let record_path = dir.join(".chassis.toml");
    let record = std::fs::read_to_string(&record_path).map_err(|e| {
        Error::config(
            format!("cannot read {}: {e}", record_path.display()),
            "run `chassis upgrade` in the project root, next to .chassis.toml",
        )
    })?;
    let cargo_path = dir.join("Cargo.toml");
    let cargo = std::fs::read_to_string(&cargo_path).map_err(|e| {
        Error::config(
            format!("cannot read {}: {e}", cargo_path.display()),
            "run `chassis upgrade` in the project root",
        )
    })?;

    // A path dependency is a local checkout, and a version means nothing to
    // it: moving the tag would claim something the build does not do.
    if let drift::KitDependency::Path(path) = drift::kit_dependency(&cargo)? {
        return Err(Error::config(
            format!("the chassis dependency is a local checkout ({path}), not a tag"),
            "this project builds against a working tree, so there is no version to move; point it back at a tag first",
        ));
    }

    let new_record = drift::set_chassis_tag(&record, &tag)?;
    let new_cargo = drift::set_kit_dependency(&cargo, &tag);
    if new_cargo == cargo && new_record == record {
        println!("chassis upgrade: already on {tag}; nothing to change");
    }
    drift::write_atomically(&record_path, &new_record)?;
    drift::write_atomically(&cargo_path, &new_cargo)?;
    println!("chassis upgrade: .chassis.toml and Cargo.toml now name {tag}");

    // Both lines, measured rather than assumed: a project that moves one and
    // forgets the other builds against two kit versions, and `sync` reads
    // only `[dependencies]` so it cannot say so.
    let moved = new_cargo.matches(&format!("tag = \"{tag}\"")).count();
    let expected = cargo.matches("tag = \"").count();
    if moved != expected {
        return Err(Error::internal(
            format!("{moved} of {expected} chassis dependency lines carry {tag}"),
            "check Cargo.toml by hand: every chassis line (the dependency and the dev-dependency) must name the same tag",
        ));
    }

    if no_verify {
        println!("chassis upgrade: --no-verify, so cargo and the gates were not run");
        return Ok(());
    }

    println!("chassis upgrade: cargo update -p chassis");
    run(dir, "cargo", &["update", "-p", "chassis"], false).map_err(|e| {
        Error::dependency(
            format!("cargo could not resolve {tag}: {}", e.message),
            "does that tag exist on the kit's repository? `git ls-remote --tags <chassis repo>` lists them",
        )
    })?;

    let gates = dir.join(".claude/hooks/gates.sh");
    if gates.is_file() {
        println!("chassis upgrade: .claude/hooks/gates.sh");
        run(dir, "bash", &[".claude/hooks/gates.sh"], false)?;
    } else {
        println!("chassis upgrade: no gates script; cargo test --workspace");
        run(dir, "cargo", &["test", "--workspace"], false)?;
    }
    println!("chassis upgrade: on {tag}, gates green. Next: chassis sync --write");
    Ok(())
}

// ───────────────────────── rendering ─────────────────────────

/// Every file the scaffold produces for `rec`, as (path, bytes, executable).
fn render_all(
    rec: &Recorded,
    features: &[String],
) -> Result<Vec<(String, String, bool, bool)>, Error> {
    let ctx = rec.context(features);
    let mut out = Vec::new();
    let has = |feature: &str| features.iter().any(|f| f == feature);
    for e in templates::ENTRIES {
        if e.path.contains("latch") && !rec.latch {
            continue;
        }
        // K34 meets K35: the smoke test logs in, issues a client and opens a
        // page, and the `testing` feature it needs implies `dashboard`. A
        // headless project would be handed a test it cannot compile, and
        // `sync` would write it back on every run because the file is
        // kit-owned.
        if e.path == "tests/kit_smoke.rs" && !has("dashboard") {
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
        deny_ignore: Vec::new(),
        vmid: 0,
        name,
        description,
        latch,
    };
    for (rel, body, exec, _) in render_all(&rec, &scaffold_features())? {
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

/// Returns whether any kit-owned file, or anything K32 compares, differed.
/// What `sync` found (K32, D1 2026-09-07). `changed`: a difference existed.
/// `unresolved`: a difference is still there when this run ends — file drift
/// that was not written, or drift `--write` cannot fix (the kit tag in
/// Cargo.toml, a branch protection without `--protect`). Scripts and CI read
/// the exit code, so `unresolved` is what decides exit 1, `--write` or not.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SyncOutcome {
    changed: bool,
    unresolved: bool,
}

fn cmd_sync(
    dir: &Path,
    write: bool,
    force: bool,
    protect: bool,
    remote: bool,
) -> Result<SyncOutcome, Error> {
    let mut rec = read_recorded(dir)?;
    if remote {
        require_tool(
            "gh",
            "install the GitHub CLI and run `gh auth login`, or drop --remote (sync stays offline without it)",
        )?;
    }
    // K32: the kp_themes record feeds the rendered files (docs/KIT.md names
    // the version), so it is compared — and with --write corrected — before
    // anything is rendered; corrected afterwards, it would leave a file
    // rendered from the stale record behind and the next sync would drift.
    let mut drifted = false;
    // D1: what is still there when this run ends decides the exit code.
    let mut unresolved = false;
    let vendored = drift::vendored_kp_themes();
    if let Some(d) = drift::kp_themes_drift(&rec.kp_themes, vendored) {
        drifted = true;
        unresolved |= !write;
        println!("{d}");
        if write {
            // The kit is the source of truth for kp_themes, so --write may
            // correct the record; Cargo.toml stays project-owned (reported only).
            let path = dir.join(".chassis.toml");
            let text = std::fs::read_to_string(&path).map_err(|e| io_err(&path, e))?;
            drift::write_atomically(&path, &drift::set_kp_themes(&text, vendored)?)?;
            println!("  written");
            rec.kp_themes = vendored.to_string();
        }
    }
    // K35: the project's own Cargo.toml decides which features the
    // generated documentation describes, so it is read BEFORE anything is
    // rendered — the same ordering lesson as kp_themes above.
    let cargo_path = dir.join("Cargo.toml");
    let cargo = std::fs::read_to_string(&cargo_path).map_err(|e| {
        Error::config(
            format!("cannot read {}: {e}", cargo_path.display()),
            "run `chassis sync` in the project root, next to .chassis.toml",
        )
    })?;
    let features = match drift::kit_features(&cargo)? {
        Some(features) => features,
        None => {
            // No chassis dependency to read: `kit_tag_drift` below reports
            // that with its remedy. Describing every feature is the honest
            // answer here — narrowing the document on a guess would hide
            // knobs the project may well have (rule 30).
            println!(
                "~ Cargo.toml: no chassis dependency, so docs/KIT.md is rendered for every kit feature"
            );
            drift::KIT_FEATURES
                .iter()
                .map(|f| (*f).to_string())
                .collect()
        }
    };
    let mut changed = false;
    for (rel, body, exec, owned) in render_all(&rec, &features)? {
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
        // fix-4: "written once by `new`" means an absent file is still
        // written — creating is not overwriting, and for the shared hooks a
        // missing file is no gate at all, which is the fail-open rule 12
        // forbids. A migrated project never ran `new`, so this is the only
        // way it ever receives one (kyu-runner, 2026-09-10).
        if owned && !force && dir.join(&rel).exists() {
            println!(
                "~ {rel} (project-owned; differs from the scaffold, left alone — use --write --force to overwrite)"
            );
            continue;
        }
        changed = true;
        unresolved |= !write;
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
    // K32: the remaining drift that is not a file, after the diffs and in one shape.
    let dep = drift::kit_dependency(&cargo)?;
    if let drift::KitDependency::Path(path) = &dep {
        println!(
            "~ Cargo.toml: chassis is a path dependency ({path}); the kit tag is not compared"
        );
    }
    for d in drift::kit_tag_drift(&dep, &rec.chassis_tag) {
        // Cargo.toml is project-owned: --write never touches it, so this
        // stays unresolved until the project moves its pin.
        drifted = true;
        unresolved = true;
        println!("{d}");
    }
    if remote {
        for d in drift::remote_drift(&rec.repo)? {
            drifted = true;
            // --protect repairs the protection right after this; without it
            // the difference is only reported.
            unresolved |= !protect;
            println!("{d}");
        }
    }
    changed |= drifted;
    if !changed {
        println!(
            "in sync with the scaffold of chassis {}",
            env!("CARGO_PKG_VERSION")
        );
    }
    if protect {
        protect_main(&rec)?;
    }
    Ok(SyncOutcome {
        changed,
        unresolved,
    })
}

fn protect_main(rec: &Recorded) -> Result<(), Error> {
    require_tool("gh", "install the GitHub CLI and run `gh auth login`")?;
    let body = serde_json::json!({
        "required_status_checks": { "strict": true, "contexts": drift::REQUIRED_CHECKS },
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
    let v = chassis::core::update::Version::parse(version)?;
    let tag = format!("v{v}");
    check_release_files(dir, &format!("release-{v}"))?;
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
            "checked: .chassis.toml present · CI runs on a push to the release branch · Dockerfile present where release.yml builds an image · Migration section on a major"
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
/// fix-5: would this workflow run for a push to `branch`?
///
/// `chassis release` pushes a `release-<version>` branch and waits for that
/// commit's checks. A workflow triggering only on `main` produces none, so the
/// wait runs to its timeout and the Actions tab has nothing to show — half an
/// hour spent on checks that could never arrive (kyu-runner, 2026-09-10,
/// CF-17). This reads just enough of the `on:` block to answer that one
/// question; anything it cannot understand is read as "covered", so an unusual
/// workflow is never refused on a guess.
fn ci_runs_on_push_to(workflow: &str, branch: &str) -> bool {
    let mut in_on = false;
    let mut push_indent: Option<usize> = None;
    let mut list_indent: Option<usize> = None;
    let mut push_seen = false;
    let mut allow: Vec<String> = Vec::new();
    let mut ignore: Vec<String> = Vec::new();
    let mut collecting_ignore = false;

    for line in workflow.lines() {
        let body = line.trim_start();
        if body.is_empty() || body.starts_with('#') {
            continue;
        }
        let indent = line.len() - body.len();

        if indent == 0 {
            in_on = body.starts_with("on:");
            push_indent = None;
            list_indent = None;
            if in_on {
                // The one-line forms carry no branch filter at all:
                // `on: push`, `on: [push, pull_request]`.
                let rest = body["on:".len()..].trim();
                if !rest.is_empty() {
                    return rest.contains("push");
                }
            }
            continue;
        }
        if !in_on {
            continue;
        }

        if let Some(li) = list_indent {
            if indent > li && body.starts_with("- ") {
                let pat = unquote(body[2..].trim());
                if collecting_ignore {
                    ignore.push(pat);
                } else {
                    allow.push(pat);
                }
                continue;
            }
            list_indent = None;
        }

        if let Some(pi) = push_indent
            && indent <= pi
        {
            push_indent = None;
        }

        if body.starts_with("push:") && push_indent.is_none() {
            push_seen = true;
            push_indent = Some(indent);
            continue;
        }

        let Some(pi) = push_indent else { continue };
        if indent <= pi {
            continue;
        }
        for (key, into_ignore) in [("branches-ignore:", true), ("branches:", false)] {
            if let Some(rest) = body.strip_prefix(key) {
                collecting_ignore = into_ignore;
                let rest = rest.trim();
                if rest.is_empty() {
                    list_indent = Some(indent);
                } else {
                    for pat in rest.trim_matches(['[', ']']).split(',') {
                        let pat = unquote(pat.trim());
                        if pat.is_empty() {
                            continue;
                        }
                        if into_ignore {
                            ignore.push(pat);
                        } else {
                            allow.push(pat);
                        }
                    }
                }
                break;
            }
        }
    }

    if !push_seen {
        return false;
    }
    if ignore.iter().any(|p| branch_matches(p, branch)) {
        return false;
    }
    allow.is_empty() || allow.iter().any(|p| branch_matches(p, branch))
}

fn unquote(s: &str) -> String {
    s.trim_matches(['\'', '"']).to_string()
}

/// GitHub's branch filter globbing, in the two forms a workflow uses: `*`
/// stops at a `/`, `**` does not.
fn branch_matches(pattern: &str, branch: &str) -> bool {
    fn go(p: &[u8], b: &[u8]) -> bool {
        match p.first() {
            None => b.is_empty(),
            Some(b'*') => {
                let (rest, crosses_slash) = if p.get(1) == Some(&b'*') {
                    (&p[2..], true)
                } else {
                    (&p[1..], false)
                };
                for i in 0..=b.len() {
                    if !crosses_slash && b[..i].contains(&b'/') {
                        break;
                    }
                    if go(rest, &b[i..]) {
                        return true;
                    }
                }
                false
            }
            Some(c) => !b.is_empty() && b[0] == *c && go(&p[1..], &b[1..]),
        }
    }
    go(pattern.as_bytes(), branch.as_bytes())
}

fn check_release_files(dir: &Path, work_branch: &str) -> Result<(), Error> {
    // fix-5: refuse before the push rather than after the wait.
    let ci = dir.join(".github/workflows/ci.yml");
    match std::fs::read_to_string(&ci) {
        Ok(w) if !ci_runs_on_push_to(&w, work_branch) => {
            return Err(Error::config(
                format!(
                    ".github/workflows/ci.yml does not run on a push to `{work_branch}`, and that is the branch this release pushes and waits for"
                ),
                "run `chassis sync --write` to take the kit's workflow (it triggers on every branch), or add the branch to the push filter; without it the wait ends in a timeout and the Actions tab shows no run at all",
            ));
        }
        Ok(_) => {}
        Err(_) => {
            return Err(Error::config(
                "the repository has no .github/workflows/ci.yml, so a release has no checks to wait for",
                "run `chassis sync --write` to add the kit's CI workflow, then release again",
            ));
        }
    }

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

/// Git exports `GIT_DIR`, `GIT_INDEX_FILE` and friends to its hooks, and a
/// project's pre-commit gate runs the suite that runs `chassis new`. A child
/// git inheriting them acts on the repository being committed instead of on
/// the fresh project — from a linked worktree (absolute `GIT_DIR`) the first
/// such commit put the scaffold on the committer's branch (2026-09-07). Every
/// child starts without them; none of the tools the CLI runs needs them.
const HOOK_ENV: [&str; 5] = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_PREFIX",
    "GIT_COMMON_DIR",
];

fn command(program: &str, dir: &Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.current_dir(dir);
    for var in HOOK_ENV {
        cmd.env_remove(var);
    }
    cmd
}

fn run(dir: &Path, program: &str, args: &[&str], quiet: bool) -> Result<(), Error> {
    let out = command(program, dir)
        .args(args)
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
    let out = command(program, dir).args(args).output().map_err(|e| {
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
mod fix_5_tests {
    use super::*;

    const KIT_CI: &str = include_str!("../../../scaffold/.github/workflows/ci.yml");

    #[test]
    fn fix_5_the_kit_workflow_covers_the_release_branch() {
        assert!(ci_runs_on_push_to(KIT_CI, "release-1.2.3"));
    }

    #[test]
    fn fix_5_a_main_only_workflow_does_not() {
        let w = "name: CI\non:\n  push:\n    branches: [main]\n  pull_request:\njobs: {}\n";
        assert!(!ci_runs_on_push_to(w, "release-1.2.3"));
        assert!(ci_runs_on_push_to(w, "main"));
    }

    #[test]
    fn fix_5_a_block_list_naming_the_pattern_does() {
        let w = "on:\n  push:\n    branches:\n      - main\n      - 'release-*'\njobs: {}\n";
        assert!(ci_runs_on_push_to(w, "release-1.2.3"));
    }

    #[test]
    fn fix_5_push_without_a_branch_filter_covers_everything() {
        assert!(ci_runs_on_push_to(
            "on:\n  push:\njobs: {}\n",
            "release-1.2.3"
        ));
        assert!(ci_runs_on_push_to(
            "on: [push, pull_request]\njobs: {}\n",
            "release-1.2.3"
        ));
    }

    #[test]
    fn fix_5_a_workflow_that_never_runs_on_push_is_refused() {
        assert!(!ci_runs_on_push_to(
            "on:\n  pull_request:\njobs: {}\n",
            "release-1.2.3"
        ));
    }
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
            deny_ignore: Vec::new(),
            vmid: 0,
        }
    }

    /// M2 / critic #4: the latch variant of the unit lets the child's READY
    /// through and runs --check under latch's secrets, and the binary lives
    /// in its own directory (S2).
    #[test]
    fn latch_unit_has_notify_access_all_and_checks_under_latch() {
        let mut r = rec();
        r.latch = true;
        let files = render_all(&r, &scaffold_features()).unwrap();
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
        let files = render_all(&rec(), &scaffold_features()).unwrap();
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
        // K27: the generated kit documentation renders with the project's
        // names and the kit's version.
        let kit_md = get("docs/KIT.md");
        assert!(
            kit_md.contains("# What demo-svc gets from chassis"),
            "{kit_md}"
        );
        assert!(kit_md.contains("chassis 0.1.0") && kit_md.contains("`v0.1.0`"));
        assert!(kit_md.contains("DEMO_SVC_TOKEN"), "{kit_md}");
        assert!(
            !files.iter().any(|(p, ..)| p.contains("latch")),
            "latch unit only on request"
        );
        let files = render_all(
            &Recorded {
                latch: true,
                ..rec()
            },
            &scaffold_features(),
        )
        .unwrap();
        assert!(
            files
                .iter()
                .any(|(p, ..)| p == "deploy/demo-svc-latch.service")
        );
    }

    /// K32: the version `new` records is the one the kit's static files
    /// are, so `.chassis.toml` cannot start life with a claim nothing checks.
    // Drilled red once (compared the constant with "3.0.0"): failed, restored.
    #[test]
    fn k32_kp_themes_constant_equals_the_vendored_manifest() {
        assert_eq!(KP_THEMES, drift::vendored_kp_themes());
    }

    /// K32: the checks protection requires are the scaffold's CI job names;
    /// this test is what keeps `REQUIRED_CHECKS` and `ci.yml` one list.
    // Drilled red once (dropped `container build` from the expected list): failed, restored.
    #[test]
    fn k32_required_checks_are_the_scaffold_ci_job_names() {
        let ci = render_all(&rec(), &scaffold_features())
            .unwrap()
            .into_iter()
            .find(|(p, ..)| p == ".github/workflows/ci.yml")
            .unwrap()
            .1;
        // Job names sit at four spaces (`    name: …`); step names are list
        // items deeper in. A job with `continue-on-error: true` is
        // informational and never required.
        let mut jobs: Vec<(String, bool)> = Vec::new();
        for line in ci.lines() {
            if let Some(name) = line.strip_prefix("    name: ") {
                jobs.push((name.trim().to_string(), false));
            } else if line == "    continue-on-error: true"
                && let Some(last) = jobs.last_mut()
            {
                last.1 = true;
            }
        }
        let required: Vec<String> = jobs
            .into_iter()
            .filter(|(_, informational)| !informational)
            .map(|(n, _)| n)
            .collect();
        assert_eq!(required, drift::REQUIRED_CHECKS, "{ci}");
    }

    /// feat-build-1: one build shape for everyone — a statically linked
    /// musl binary on distroless/static. Every release binary the scaffold
    /// produced before needed GLIBC_2.39 and would not start on Debian 12,
    /// which blocked three rollouts on 2026-09-09. The shape lives in four
    /// files that have to agree, so it is pinned here instead of being left
    /// to whoever edits one of them next.
    // Drilled red once per assertion (2026-09-10).
    #[test]
    fn feat_build_1_the_scaffold_builds_static_musl_on_distroless() {
        let files = render_all(&rec(), &scaffold_features()).unwrap();
        let get = |p: &str| {
            files
                .iter()
                .find(|(path, ..)| path == p)
                .map(|(_, b, ..)| b.clone())
                .unwrap_or_else(|| panic!("{p} missing"))
        };

        let release = get(".github/workflows/release.yml");
        assert!(
            release.contains("cargo build --release --locked --target x86_64-unknown-linux-musl"),
            "the released binary is built for musl:\n{release}"
        );
        // The install line, not the word: the comment above it names
        // musl-tools too, and a comment compiles nothing.
        assert!(
            release.contains("install -y -qq musl-tools"),
            "`ring` compiles C, so the builder needs the musl C compiler:\n{release}"
        );
        assert!(
            release.contains("cp target-musl/x86_64-unknown-linux-musl/release/demo-svc dist/"),
            "the release ships the musl binary, not a stale glibc one:\n{release}"
        );
        assert!(
            release.contains("ldd dist/demo-svc") && release.contains("grep -q '=>'"),
            "a step refuses a binary with a resolved shared library:\n{release}"
        );

        let dockerfile = get("Dockerfile");
        assert!(
            dockerfile
                .contains("cargo build --release --locked --target x86_64-unknown-linux-musl")
                && dockerfile.contains("/src/target/x86_64-unknown-linux-musl/release/demo-svc"),
            "the image carries the same binary the release does:\n{dockerfile}"
        );
        // Everything after the last FROM is the runtime stage; the comments
        // above it explain what that stage no longer needs, so they must not
        // be what these assertions read.
        let (_, runtime) = dockerfile
            .split_once("FROM gcr.io/distroless/static:nonroot")
            .expect("the runtime stage is distroless/static");
        assert!(
            runtime.contains("USER 65532:65532"),
            "uid 65532 is built into the image:\n{runtime}"
        );
        assert!(
            !runtime.contains("apt-get")
                && !runtime.contains("useradd")
                && !runtime.contains("libssl3t64"),
            "distroless has no package manager and needs no OpenSSL:\n{runtime}"
        );

        let toolchain = get("rust-toolchain.toml");
        assert!(
            toolchain.contains(r#"targets = ["x86_64-unknown-linux-musl"]"#),
            "the pin owns the target, so no `rustup target add` can miss it:\n{toolchain}"
        );

        // The comment above the dependency explains why passkeys is absent,
        // so the dependency line itself is what this asserts on.
        let cargo = get("Cargo.toml");
        let dep = cargo
            .lines()
            .find(|l| l.starts_with("chassis = {"))
            .expect("the kit dependency line");
        assert!(
            !dep.contains("passkeys"),
            "passkeys pulls OpenSSL, which a musl build would vendor per release: {dep}"
        );
        assert!(
            dep.contains("\"dashboard\""),
            "what it does build stays: {dep}"
        );
    }

    /// K27: the rendered KIT.md is generated (says so, names the kit
    /// version and the tag it matches), carries the project's prefix, every
    /// knob key, and no template variable that escaped rendering. Drilled
    /// red once by dropping `knobs_table` from the template context.
    /// K35: the document a headless service carries describes a headless
    /// service. Standing rule 43 (kyu-runner, 2026-09-09): the title
    /// carries the project's name, so every section under it reads as a
    /// promise about that project. Drilled red by rendering with
    /// `scaffold_features()` instead: the dashboard section came back and
    /// the assertion fired.
    #[test]
    fn k35_kit_md_leaves_out_what_this_project_does_not_build() {
        let headless: Vec<String> = ["core", "self-update"]
            .iter()
            .map(|f| (*f).to_string())
            .collect();
        let files = render_all(&rec(), &headless).unwrap();
        let (_, kit_md, ..) = files
            .iter()
            .find(|(p, ..)| p == "docs/KIT.md")
            .expect("docs/KIT.md rendered");
        assert!(
            kit_md.contains("This binary is built with: core, self-update."),
            "the document says which part of the kit this is:\n{kit_md}"
        );
        for absent in [
            "## The dashboard",
            "## Notifications",
            // The command row and the knob, not the bare words: the
            // headless door section names `gen-secret` and the secret key
            // precisely to say they are NOT part of this binary.
            "`demo-svc gen-secret`",
            "| `DEMO_SVC_TOKEN` |",
            "| `DEMO_SVC_PUBLIC_URL` |",
        ] {
            assert!(
                !kit_md.contains(absent),
                "{absent} is not part of this service:\n{kit_md}"
            );
        }
        assert!(
            kit_md.contains("## Self-update") && kit_md.contains("| `DEMO_SVC_UPDATE_URL` |"),
            "what it does build stays:\n{kit_md}"
        );
        assert!(
            kit_md.contains("## Health and metrics") && kit_md.contains("| `DEMO_SVC_LISTEN` |"),
            "core stays:\n{kit_md}"
        );
    }

    #[test]
    fn k27_kit_md_carries_every_knob_and_the_project_prefix() {
        let files = render_all(&rec(), &scaffold_features()).unwrap();
        let (_, kit_md, exec, owned) = files
            .iter()
            .find(|(p, ..)| p == "docs/KIT.md")
            .expect("docs/KIT.md rendered");
        assert!(!exec && !owned, "kit-owned, not executable");
        assert!(
            kit_md.contains("Generated by `chassis sync` from chassis 0.1.0"),
            "{kit_md}"
        );
        assert!(
            kit_md.contains("as long as `chassis_tag` in") && kit_md.contains("reads `v0.1.0`."),
            "{kit_md}"
        );
        assert!(kit_md.contains("DEMO_SVC_TOKEN") && kit_md.contains("DEMO_SVC_SECRET_KEY"));
        assert!(kit_md.contains("| `DEMO_SVC_LISTEN` |"), "{kit_md}");
        // Every knob of what a fresh project builds, and none of what it
        // does not: since feat-build-1 the scaffold leaves `passkeys` off,
        // so its two knobs are exactly the rows K35 has to withhold.
        let built = scaffold_features();
        for knob in chassis::AppSpec::default().knobs() {
            let row = format!("| `{}` |", knob.key);
            match knob.feature {
                Some(f) if !built.iter().any(|b| b == f) => assert!(
                    !kit_md.contains(&row),
                    "`{}` is a `{f}` knob and this project does not build {f}:\n{kit_md}",
                    knob.key
                ),
                _ => assert!(kit_md.contains(&row), "{} missing", knob.key),
            }
        }
        assert!(
            !kit_md.contains("{{ ") && !kit_md.contains("{% "),
            "a template variable escaped rendering:\n{kit_md}"
        );
        assert!(
            kit_md.contains("${DEMO_SVC_HOOK_TOKEN}"),
            "the `${{VAR}}` example survives the template engine:\n{kit_md}"
        );
        assert!(
            kit_md.contains("/var/lib/demo-svc") && kit_md.contains("/etc/demo-svc/demo-svc.env")
        );
        assert!(
            kit_md.contains("`chassis clients`"),
            "names the headless way to issue tokens"
        );
        assert!(
            kit_md.contains("--knobs"),
            "names the control that prints the same table"
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

    /// feat-sync-1: the kit version lives in three places and one command
    /// moves all three. Drilled red by rewriting only the first `tag = "…"`
    /// of a line: the dev-dependency kept the old tag and the count check
    /// reported "1 of 2 chassis dependency lines".
    #[test]
    fn feat_sync_1_upgrade_moves_every_line_that_names_the_kit() {
        let cargo = r#"[dependencies]
chassis = { git = "g", tag = "v1.8.0", version = "1.8.0", features = ["dashboard"] }
serde = "1"

[dev-dependencies]
chassis = { git = "g", tag = "v1.8.0", version = "1.8.0", features = ["testing"] }
"#;
        let moved = drift::set_kit_dependency(cargo, "v1.9.0");
        assert_eq!(
            moved.matches("tag = \"v1.9.0\"").count(),
            2,
            "both lines move, the dependency and the dev-dependency:\n{moved}"
        );
        assert_eq!(
            moved.matches("version = \"1.9.0\"").count(),
            2,
            "and so does the version requirement beside each tag:\n{moved}"
        );
        assert!(
            moved.contains("serde = \"1\""),
            "nothing else in the file is touched:\n{moved}"
        );
        assert!(
            moved.contains("features = [\"testing\"]"),
            "the feature lists survive:\n{moved}"
        );

        let record = "name = \"demo\"\nchassis_tag = \"v1.8.0\" # the kit\nkp_themes = \"5.0.0\"\n";
        let rewritten = drift::set_chassis_tag(record, "v1.9.0").unwrap();
        assert!(
            rewritten.contains("chassis_tag = \"v1.9.0\" # the kit"),
            "the record moves and keeps its note: {rewritten}"
        );
        assert!(
            rewritten.contains("kp_themes = \"5.0.0\""),
            "and the other lines stay: {rewritten}"
        );
    }

    /// K34 + K35: the smoke test comes with the dashboard it drives. A
    /// headless project must not be handed a test that logs in — and
    /// because the file is kit-owned, `sync` would rewrite it on every run.
    /// Drilled red by removing the skip in `render_all`.
    #[test]
    fn k34_a_headless_project_gets_no_kit_smoke_test() {
        let headless: Vec<String> = ["core", "self-update"]
            .iter()
            .map(|f| (*f).to_string())
            .collect();
        let files = render_all(&rec(), &headless).unwrap();
        assert!(
            !files.iter().any(|(p, ..)| p == "tests/kit_smoke.rs"),
            "the smoke test needs a dashboard to log in to"
        );
        let cargo = files
            .iter()
            .find(|(p, ..)| p == "Cargo.toml")
            .expect("Cargo.toml rendered")
            .1
            .clone();
        assert!(
            !cargo.contains("features = [\"testing\"]"),
            "and the harness is not a dev-dependency there either:\n{cargo}"
        );
        let full = render_all(&rec(), &scaffold_features()).unwrap();
        assert!(
            full.iter().any(|(p, ..)| p == "tests/kit_smoke.rs"),
            "a project with a dashboard still gets it"
        );
    }

    #[test]
    fn the_git_dependency_pins_a_version_next_to_its_tag() {
        // cargo-deny's `wildcards = "deny"` flags a git dependency without a
        // version requirement; the first remote `chassis new` was red on it
        // (2026-09-06), as kyu-runner's migration had already found by hand.
        let cargo = render_all(&rec(), &scaffold_features())
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

    /// K34 moved this test to one `Recorded`: the scaffold now names the kit
    /// twice (the dependency and the dev-dependency on its test harness), and
    /// `with_chassis_path` only rewrites the first line. Rendering with the
    /// same record `cmd_new` renders with is what the real flow does — the
    /// template turns the dev-dependency into a path dependency itself — and
    /// it is what makes "no git dependency is left" true again.
    #[test]
    fn chassis_path_replaces_the_git_dependency() {
        let local_rec = Recorded {
            chassis_path: Some("/tmp/kit".into()),
            ..rec()
        };
        let cargo = render_all(&local_rec, &scaffold_features())
            .unwrap()
            .into_iter()
            .find(|(p, ..)| p == "Cargo.toml")
            .unwrap()
            .1;
        let local = with_chassis_path(&cargo, &local_rec);
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
        // K27: `new` writes the kit documentation and `sync` sees it as
        // in sync (the clean-sync assertion below covers the second half).
        assert!(target.join("docs/KIT.md").exists(), "docs/KIT.md written");
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
            !cmd_sync(&target, false, false, false, false)
                .unwrap()
                .changed,
            "no differences right after new"
        );
        // A drifted kit file is reported and --write repairs it.
        std::fs::write(target.join("deny.toml"), "# drifted\n").unwrap();
        assert!(
            cmd_sync(&target, false, false, false, false)
                .unwrap()
                .changed
        );
        assert!(
            cmd_sync(&target, true, false, false, false)
                .unwrap()
                .changed
        );
        assert!(
            !cmd_sync(&target, false, false, false, false)
                .unwrap()
                .changed
        );
        // fix-4: a project-owned file that is GONE is written back — creating
        // is not overwriting, and a missing hook is no gate at all (rule 12).
        // kyu-runner asked the question that found this: a migrated project
        // never runs `new`, so it would have waited forever for check-ids.sh.
        std::fs::remove_file(target.join(".githooks/check-ids.sh")).unwrap();
        assert!(
            cmd_sync(&target, false, false, false, false)
                .unwrap()
                .unresolved,
            "a missing project-owned file is drift, not silence"
        );
        assert!(
            cmd_sync(&target, true, false, false, false)
                .unwrap()
                .changed
        );
        assert!(
            target.join(".githooks/check-ids.sh").exists(),
            "--write puts the missing hook back"
        );
        // ... but one that exists and differs is still left alone.
        std::fs::write(target.join(".githooks/check-ids.sh"), "# mine\n").unwrap();
        assert!(
            !cmd_sync(&target, true, false, false, false)
                .unwrap()
                .changed,
            "a shared hook that is present is never rewritten"
        );
        assert_eq!(
            std::fs::read_to_string(target.join(".githooks/check-ids.sh")).unwrap(),
            "# mine\n"
        );
        // A project-owned file is left alone.
        std::fs::write(target.join("src/main.rs"), "fn main() {}\n").unwrap();
        assert!(
            !cmd_sync(&target, false, false, false, false)
                .unwrap()
                .changed,
            "owned files do not count as drift"
        );
        assert_eq!(
            std::fs::read_to_string(target.join("src/main.rs")).unwrap(),
            "fn main() {}\n"
        );
        // K32: a stale kp_themes record is drift; --write corrects it and
        // keeps the file's header comment. Drilled red once (dropped the
        // `changed |= drifted` line in cmd_sync): failed, restored.
        let chassis_toml = target.join(".chassis.toml");
        let text = std::fs::read_to_string(&chassis_toml).unwrap();
        std::fs::write(&chassis_toml, text.replace(KP_THEMES, "3.0.0")).unwrap();
        assert!(
            cmd_sync(&target, false, false, false, false)
                .unwrap()
                .changed
        );
        assert!(
            cmd_sync(&target, true, false, false, false)
                .unwrap()
                .changed
        );
        assert_eq!(std::fs::read_to_string(&chassis_toml).unwrap(), text);
        assert!(
            !cmd_sync(&target, false, false, false, false)
                .unwrap()
                .changed
        );
        // K32: a Cargo.toml that pins another kit tag is drift --write does not touch.
        let cargo = target.join("Cargo.toml");
        let pinned = std::fs::read_to_string(&cargo).unwrap();
        std::fs::write(
            &cargo,
            pinned.replace("tag = \"v0.1.0\"", "tag = \"v0.0.9\""),
        )
        .unwrap();
        assert!(
            cmd_sync(&target, true, false, false, false)
                .unwrap()
                .changed
        );
        assert!(
            std::fs::read_to_string(&cargo).unwrap().contains("v0.0.9"),
            "Cargo.toml is project-owned"
        );
        // D1 (2026-09-07): a difference --write cannot fix stays unresolved,
        // and that — not "did --write run" — decides the exit code. Drilled
        // red once (unresolved computed as `changed && !write`, the pre-D1
        // rule): failed, restored.
        let after = cmd_sync(&target, true, false, false, false).unwrap();
        assert!(
            after.unresolved,
            "the foreign kit tag is still there after --write"
        );
        let fixed = std::fs::read_to_string(&cargo)
            .unwrap()
            .replace("v0.0.9", "v0.1.0");
        std::fs::write(&cargo, fixed).unwrap();
        assert!(
            !cmd_sync(&target, false, false, false, false)
                .unwrap()
                .unresolved,
            "nothing left once Cargo.toml agrees again"
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
        // fix-5 runs first, so the project needs a CI workflow that would
        // actually check the branch this release pushes.
        std::fs::write(
            wf.join("ci.yml"),
            "on:\n  push:\n    branches: [\"**\"]\njobs: {}\n",
        )
        .unwrap();
        let err = check_release_files(&dir, "release-1.0.0").unwrap_err();
        assert!(err.to_string().contains("no Dockerfile"), "{err}");
        std::fs::write(dir.join("Dockerfile"), "FROM scratch\n").unwrap();
        check_release_files(&dir, "release-1.0.0").unwrap();
        // A workflow without an image job needs no Dockerfile.
        std::fs::remove_file(dir.join("Dockerfile")).unwrap();
        std::fs::write(wf.join("release.yml"), "steps:\n  - run: cargo build\n").unwrap();
        check_release_files(&dir, "release-1.0.0").unwrap();
        // fix-5: a workflow that only watches main is refused before the push,
        // instead of the release waiting out its timeout on checks that never
        // start (kyu-runner, 2026-09-10).
        std::fs::write(
            wf.join("ci.yml"),
            "on:\n  push:\n    branches: [main]\njobs: {}\n",
        )
        .unwrap();
        let err = check_release_files(&dir, "release-1.0.0").unwrap_err();
        assert!(err.to_string().contains("does not run on a push"), "{err}");
        std::fs::remove_file(wf.join("ci.yml")).unwrap();
        let err = check_release_files(&dir, "release-1.0.0").unwrap_err();
        assert!(
            err.to_string().contains("no .github/workflows/ci.yml"),
            "{err}"
        );
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
        let files = render_all(&r, &scaffold_features()).unwrap();
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
        r.vmid = 112;
        let files = render_all(&r, &scaffold_features()).unwrap();
        let stack = &files
            .iter()
            .find(|(p, ..)| p == "deploy/service.yml")
            .unwrap()
            .1;
        assert!(
            stack.contains("vmid: 112\nhostname: 112-app-demo-svc"),
            "{stack}"
        );
        assert!(
            stack.contains("env_file: /appdata/demo-svc/demo-svc-config/latch.env"),
            "{stack}"
        );
        assert!(
            stack
                .contains("--property=EnvironmentFile=/appdata/demo-svc/demo-svc-config/latch.env"),
            "{stack}"
        );
        // fix-3 (Almanac on CT 112, 2026-09-09): every Environment= line the
        // unit declares is reproduced, or a supervised `update --check` runs
        // against the binary's compiled-in default state directory and its
        // failure blames a missing secret. Drilled red by removing the two
        // --property=Environment= lines from the template: both assertions
        // fired, and the unit still declared the variables.
        for line in [
            "--property=Environment=DEMO_SVC_STATE_DIR=/var/lib/demo-svc",
            "--property=Environment=DEMO_SVC_TIMEOUT_STOP_SECS=60",
        ] {
            assert!(
                stack.contains(line),
                "update_cmd is missing {line}:\n{stack}"
            );
        }
        let unit_with_env = &files
            .iter()
            .find(|(p, ..)| p == "deploy/demo-svc.service")
            .unwrap()
            .1;
        for (var, value) in [
            ("DEMO_SVC_STATE_DIR", "/var/lib/demo-svc"),
            ("DEMO_SVC_TIMEOUT_STOP_SECS", "60"),
        ] {
            assert!(
                unit_with_env.contains(&format!("Environment={var}={value}")),
                "the unit declares {var}, so update_cmd must carry it:\n{unit_with_env}"
            );
        }

        // The defaults are what a fresh project always got.
        let fresh = render_all(&rec(), &scaffold_features()).unwrap();
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

    /// 1.7.0: a project's reviewed advisory exceptions live in .chassis.toml
    /// and reach the kit-owned deny.toml, so a sync keeps them.
    #[test]
    fn deny_ignore_reaches_the_rendered_deny_toml() {
        let mut r = rec();
        r.deny_ignore = vec!["RUSTSEC-2023-0071".into(), "RUSTSEC-2025-0012".into()];
        let files = render_all(&r, &scaffold_features()).unwrap();
        let deny = &files.iter().find(|(p, ..)| p == "deny.toml").unwrap().1;
        assert!(
            deny.contains("ignore = [\"RUSTSEC-2023-0071\", \"RUSTSEC-2025-0012\"]"),
            "{deny}"
        );
        let fresh = render_all(&rec(), &scaffold_features()).unwrap();
        let deny = &fresh.iter().find(|(p, ..)| p == "deny.toml").unwrap().1;
        assert!(deny.contains("ignore = []"), "{deny}");
    }
}
