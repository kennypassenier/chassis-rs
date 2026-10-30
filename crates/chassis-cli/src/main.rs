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
//!   vendors, files the kit no longer ships, and with `--remote` branch
//!   protection vs what the kit sets); `--write` applies; `--protect` sets
//!   branch protection (no required checks since 3.0.0: there is no CI).
//! - `release <version>`: the full gate on this machine, bump, changelog,
//!   commit, tag, the static binary + `SHA256SUMS` + image built here, push,
//!   GitHub release, then sign and upload with `scripts/sign-release.sh`
//!   (3.0.0: nothing runs on GitHub Actions; see `release.rs`).
//!   `--dry-run` runs the gate and builds every asset, then stops before
//!   any commit, tag, push or upload; `--plan` prints the steps only.
//! - `clients <verb>`: manage a running service's client tokens over its
//!   own `/api/clients` (K30), for services without a dashboard operator
//!   at hand; see `clients.rs`.
//!
//! Every external tool is called by name and reported with a remedy when
//! missing; nothing here needs a personal access token (J2).

#![forbid(unsafe_code)]

mod clients;
mod drift;
mod failed_tests;
mod kit_docs;
mod manifest_version;
mod new_project;
mod new_validation;
mod process;
mod protect;
mod recorded;
mod release;
mod release_changelog;
mod release_config;
mod release_flow;
mod release_hooks;
mod release_plan;
mod release_preflight;
mod release_restore;
mod render;
mod sync;
mod sync_files;
mod templates;
#[cfg(test)]
mod tests;
mod upgrade;

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use new_project::cmd_new;
use release_flow::cmd_release;
use sync::cmd_sync;
use upgrade::cmd_upgrade;

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
        /// Set branch protection on main: no force-push, no deletion, no required checks (needs gh)
        #[arg(long)]
        protect: bool,
        /// Also compare main's branch protection with what --protect sets (needs gh; sync is offline without it)
        #[arg(long)]
        remote: bool,
    },
    /// Gate, bump, tag, build, publish, sign and upload the release, all from this machine
    #[command(
        long_about = "Release the project from this machine (3.0.0). Runs the full gate the kit's CI workflow used to run (fmt, clippy -D warnings, tests, .claude/hooks/gates.project.sh, --version, cargo deny, the image build with its --version and --healthcheck smoke, coverage as information), bumps Cargo.toml and CHANGELOG.md, commits through the hooks and tags, then builds what the release workflow used to build: the static musl binary in rust:<toolchain>-slim-trixie, refused on any dynamic link, dist/<name> + dist/SHA256SUMS, and the image ghcr.io/<repo>:v<version> + :latest. Then it pushes main and the tag, pushes the image, creates the GitHub release without taking `latest`, and runs scripts/sign-release.sh, which signs, uploads SHA256SUMS.minisig and VERSION and marks the release latest. Needs git, cargo, cargo-deny, docker (logged in to ghcr.io with write:packages), gh and minisign."
    )]
    Release {
        version: String,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        /// Run the gate and build every asset (binary, SHA256SUMS, image), then stop: no commit, tag, push or upload
        #[arg(long, conflicts_with = "plan")]
        dry_run: bool,
        /// Print every step without running any of them (no gate, no build)
        #[arg(long)]
        plan: bool,
        /// Run the whole test suite even when a failed run is recorded (.chassis/release-failed.json)
        #[arg(long)]
        full_tests: bool,
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
            plan,
            full_tests,
        } => cmd_release(&dir, &version, dry_run, plan, full_tests),
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
