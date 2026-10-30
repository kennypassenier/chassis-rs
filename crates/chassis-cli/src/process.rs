//! How the CLI runs the tools it calls by name (git, cargo, docker, gh,
//! minisign): one place that scrubs the hook environment, turns a missing
//! program or a failing step into an `Error` with a remedy, and decides
//! whether a step's output is buffered or passed through to the terminal.

use std::path::Path;
use std::process::Command;

use chassis::Error;

pub(crate) fn require_tool(tool: &str, remedy: &str) -> Result<(), Error> {
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
pub(crate) const HOOK_ENV: [&str; 5] = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_PREFIX",
    "GIT_COMMON_DIR",
];

pub(crate) fn command(program: &str, dir: &Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.current_dir(dir);
    for var in HOOK_ENV {
        cmd.env_remove(var);
    }
    cmd
}

pub(crate) fn run(dir: &Path, program: &str, args: &[&str], quiet: bool) -> Result<(), Error> {
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

/// Runs a step that talks to the person at the terminal: all three streams are
/// passed through, so a prompt is visible the moment it is printed. `run`
/// buffers stdout and stderr until the child exits, which hid minisign's
/// password prompt while stdin still waited for it (fix-7).
pub(crate) fn run_interactive(dir: &Path, program: &str, args: &[&str]) -> Result<(), Error> {
    let status = interactive_command(dir, program, args)
        .status()
        .map_err(|e| {
            Error::dependency(
                format!("cannot run {program}: {e}"),
                format!("is {program} installed and on PATH?"),
            )
        })?;
    if !status.success() {
        return Err(Error::dependency(
            format!("{program} {} failed ({status})", args.join(" ")),
            "read its output above; nothing after this step ran",
        ));
    }
    Ok(())
}

pub(crate) fn interactive_command(dir: &Path, program: &str, args: &[&str]) -> Command {
    use std::process::Stdio;
    let mut cmd = command(program, dir);
    cmd.args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    cmd
}

pub(crate) fn capture(dir: &Path, program: &str, args: &[&str]) -> Result<String, Error> {
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
