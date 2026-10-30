//! The release gate: everything the scaffold's `ci.yml` ran, in its order, on
//! this machine. Its own module because the gate is a fixed sequence of
//! checks that refuse the release, separate from building and publishing.

use std::path::Path;
use std::process::Stdio;

use chassis::Error;

use super::test_step::run_tests;
use super::{RELEASE_GATE_ENV, cargo_plugin_available, is_executable, step, step_env, took};
use crate::process::command;
use crate::recorded::Recorded;

/// Kenny, 2026-09-29: "drie keer dezelfde testrun is dom, dat moet naar
/// één". The scaffold's pre-commit hook stamps the tree its gates saw green
/// (`~/Projects/workstation/bin/gate-stamp`); when HEAD's clean tree is that
/// tree, fmt, clippy and the tests have run on it already. A missing helper
/// or any failure means "not fresh", so the gate runs.
fn gate_stamp_fresh(dir: &Path) -> bool {
    let Some(home) = std::env::var_os("HOME") else {
        return false;
    };
    let helper = Path::new(&home).join("Projects/workstation/bin/gate-stamp");
    helper.is_file()
        && std::process::Command::new(&helper)
            .arg("fresh")
            .current_dir(dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
}

/// Everything the scaffold's `ci.yml` ran, in its order, on this machine.
///
/// The three required jobs (gates, cargo-deny, container build) refuse the
/// release; coverage was informational in CI (`continue-on-error: true`) and
/// stays informational here: it reports and never stops.
pub fn gate(dir: &Path, rec: &Recorded, image: bool, full_tests: bool) -> Result<(), Error> {
    let started = std::time::Instant::now();
    // Job `fmt · clippy · tests`, unless the commit gate already ran it on
    // exactly this tree (one full test run per release).
    if gate_stamp_fresh(dir) {
        println!(
            "chassis release: fmt · clippy · tests already green on this tree at commit (gate-stamp); not run again"
        );
    } else {
        step(
            dir,
            "format check",
            "cargo",
            &["fmt", "--all", "--", "--check"],
        )?;
        step(
            dir,
            "clippy (warnings are errors)",
            "cargo",
            &["clippy", "--all-targets", "--", "-D", "warnings"],
        )?;
        run_tests(dir, full_tests)?;
    }
    project_gates(dir)?;
    binary_answers_version(dir, rec)?;

    // Job `cargo-deny (advisories · licenses · bans)`.
    step(dir, "cargo-deny", "cargo", &["deny", "check", "all"])?;

    // Job `container build`, for a project that ships an image.
    if image {
        container_build(dir, rec)?;
    } else {
        println!("chassis release: container build: skipped (no image for this project)");
    }

    // Job `coverage (informational)`.
    coverage(dir);
    println!(
        "chassis release: gate green, took {} (measured)",
        took(started.elapsed())
    );
    Ok(())
}

/// The project's own gate script, when it has one.
fn project_gates(dir: &Path) -> Result<(), Error> {
    let project_gates = dir.join(".claude/hooks/gates.project.sh");
    if is_executable(&project_gates) {
        step_env(
            dir,
            "project gates",
            ".claude/hooks/gates.project.sh",
            &[],
            &[(RELEASE_GATE_ENV, "1")],
        )
    } else {
        println!("chassis release: project gates: none (.claude/hooks/gates.project.sh absent)");
        Ok(())
    }
}

/// AR20: the binary answers `--version` without configuration.
fn binary_answers_version(dir: &Path, rec: &Recorded) -> Result<(), Error> {
    // A workspace has several binaries and `cargo run` picks none of them:
    // name the first one `[release] binaries` lists.
    let run_bin = rec.release.binaries.first().map(String::as_str);
    let version_args: Vec<&str> = match run_bin {
        Some(b) => vec!["run", "-q", "--bin", b, "--", "--version"],
        None => vec!["run", "-q", "--", "--version"],
    };
    step(
        dir,
        "the binary answers --version without configuration (AR20)",
        "cargo",
        &version_args,
    )
}

/// Builds the project's image, proves it answers `--version`, and proves its
/// `--healthcheck` refuses a closed port.
fn container_build(dir: &Path, rec: &Recorded) -> Result<(), Error> {
    let image = format!("{}:ci", rec.name);
    step(
        dir,
        "container build",
        "docker",
        &["build", "-t", &image, "."],
    )?;
    step(
        dir,
        "the image answers --version",
        "docker",
        &["run", "--rm", &image, "--version"],
    )?;
    println!("chassis release: --healthcheck must refuse a closed port");
    let refused = command("docker", dir)
        .args([
            "run",
            "--rm",
            &image,
            "--healthcheck",
            "http://127.0.0.1:1/healthz",
        ])
        .status()
        .map_err(|e| {
            Error::dependency(format!("cannot run docker: {e}"), "is docker installed?")
        })?;
    if refused.success() {
        return Err(Error::internal(
            "the image's --healthcheck passed against a closed port",
            "a healthcheck that cannot fail proves nothing; fix the binary's --healthcheck",
        ));
    }
    Ok(())
}

fn coverage(dir: &Path) {
    if !cargo_plugin_available(dir, "llvm-cov") {
        println!(
            "chassis release: coverage (informational): skipped, cargo-llvm-cov is not installed here \
             (cargo install cargo-llvm-cov --locked && rustup component add llvm-tools-preview)"
        );
        return;
    }
    if let Err(e) = step(
        dir,
        "coverage (informational)",
        "cargo",
        &["llvm-cov", "--summary-only"],
    ) {
        println!(
            "chassis release: coverage (informational) did not finish ({}); not a gate, continuing",
            e.message
        );
    }
}
