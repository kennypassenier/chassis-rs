//! The local half of `chassis release` (3.0.0; Kenny, 2026-09-29: "tests and
//! release builds run locally, then the result is uploaded").
//!
//! Until 2.4.x a project carried two GitHub Actions workflows the scaffold
//! wrote: `ci.yml` (fmt, clippy, tests, the project's gates, `--version`,
//! cargo-deny, the image smoke, coverage) and `release.yml` (a static musl
//! binary built in `rust:<toolchain>-slim-trixie`, an `ldd` refusal,
//! `SHA256SUMS`, the image pushed to GHCR, and the GitHub release). The
//! release command pushed a branch, waited for the first, tagged, and waited
//! for the second. Both now run here, step for step, so nothing waits on a
//! runner and the release is built from the tree that was just gated:
//!
//! - [`gate`] is everything `ci.yml` ran, in the same order.
//! - [`build_binary`] and [`build_image`] are what `release.yml` built,
//!   with the same docker invocation, asset names and image tags.
//! - [`publish`] is what `release.yml` uploaded: the image and the release,
//!   still without taking `latest` (fix-10); signing takes it afterwards.
//!
//!
//! The pieces live in `release/`: `gate` and `test_step` (the checks),
//! `build_args` and `build` (the assets), `publish` (the upload). This file
//! keeps what they share: the constants, the step runner and the tool probes.

use std::path::Path;
use std::process::Stdio;

use chassis::Error;

use crate::process::command;

mod build;
mod build_args;
mod gate;
mod publish;
mod test_step;
#[cfg(test)]
mod tests;

pub use build::{build_binary, build_image, check_tag_matches, image_tags};
#[cfg(test)]
pub(crate) use build_args::musl_build_args_for;
pub use build_args::{build_plan_line, linkage_label};
pub use gate::gate;
pub use publish::{KEEP_IMAGES, publish, release_create_args, wants_image, write_notes};

/// The one release target (feat-build-1): statically linked, so the host's
/// glibc stops deciding whether the service starts.
pub const MUSL_TARGET: &str = "x86_64-unknown-linux-musl";

/// Where the musl build writes, inside the project (gitignored by the
/// scaffold's `.gitignore`). Separate from `target/` so a glibc debug build
/// and the release build never invalidate each other.
pub const MUSL_TARGET_DIR: &str = "target-musl";

/// The environment variable a project's `.claude/hooks/gates.project.sh`
/// sees when the release gate runs it — the local stand-in for the `CI=true`
/// a GitHub runner exported, for a project gate that runs heavier checks
/// there (kyu's container smoke).
pub const RELEASE_GATE_ENV: &str = "CHASSIS_RELEASE_GATE";

/// Runs one step with its output streamed, and names it first.
fn step(dir: &Path, what: &str, program: &str, args: &[&str]) -> Result<(), Error> {
    step_env(dir, what, program, args, &[])
}

fn step_env(
    dir: &Path,
    what: &str,
    program: &str,
    args: &[&str],
    env: &[(&str, &str)],
) -> Result<(), Error> {
    println!("chassis release: {what}: {program} {}", args.join(" "));
    let mut cmd = command(program, dir);
    cmd.args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    for (k, v) in env {
        cmd.env(k, v);
    }
    let status = cmd.status().map_err(|e| {
        Error::dependency(
            format!("cannot run {program}: {e}"),
            format!("is {program} installed and on PATH?"),
        )
    })?;
    if status.success() {
        Ok(())
    } else {
        Err(Error::dependency(
            format!("{what} failed ({program} {}: {status})", args.join(" ")),
            "read its output above; nothing after this step ran",
        ))
    }
}

fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(path).is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

/// Whether `cargo <sub>` exists here (cargo-deny, cargo-llvm-cov are cargo
/// plugins, so `require_tool` on the plugin name would miss them).
pub fn cargo_plugin_available(dir: &Path, sub: &str) -> bool {
    command("cargo", dir)
        .args([sub, "--version"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|s| s.success())
}

/// Kenny, 2026-10-02: every test run reports its measured duration, in
/// minutes and seconds ("1 min 40 s", "48 s").
pub fn took(d: std::time::Duration) -> String {
    let s = d.as_secs();
    if s >= 60 {
        format!("{} min {} s", s / 60, s % 60)
    } else {
        format!("{s} s")
    }
}
