//! Project hooks of `chassis release` (homelab-shared-4): the scripts a
//! `[release.hooks]` table names, run at the points the release defines.
//! The kit knows nothing about what they check; it only runs them, in
//! order, from the project root, and stops on the first failure.

use std::path::Path;
use std::process::Stdio;

use chassis::Error;

use crate::command;

/// What a hook sees of the release it belongs to.
pub struct HookEnv<'a> {
    pub version: &'a str,
    pub tag: &'a str,
    pub dry_run: bool,
}

fn build(dir: &Path, line: &str, env: &HookEnv<'_>) -> Result<std::process::Command, Error> {
    let mut parts = line.split_whitespace();
    let program = parts.next().ok_or_else(|| {
        Error::config(
            "a release hook is empty",
            "name the script in [release.hooks]",
        )
    })?;
    // A relative script path is the project's: resolve it against the root,
    // because `command` sets the working directory and a bare name would
    // otherwise be searched on PATH.
    let program = if program.contains('/') && !Path::new(program).is_absolute() {
        dir.join(program).display().to_string()
    } else {
        program.to_string()
    };
    let mut cmd = command(&program, dir);
    cmd.args(parts)
        .env("CHASSIS_RELEASE_VERSION", env.version)
        .env("CHASSIS_RELEASE_TAG", env.tag)
        .env(
            "CHASSIS_RELEASE_DRY_RUN",
            if env.dry_run { "1" } else { "0" },
        );
    Ok(cmd)
}

fn failed(stage: &str, line: &str, status: impl std::fmt::Display) -> Error {
    Error::dependency(
        format!("release hook `{line}` ({stage}) failed: {status}"),
        "read its output above; nothing after this step ran. Fix what it reports, or change [release.hooks] in .chassis.toml",
    )
}

/// Runs each command of `stage` in order with its output streamed.
pub fn run_stage(
    dir: &Path,
    stage: &str,
    lines: &[String],
    env: &HookEnv<'_>,
) -> Result<(), Error> {
    for line in lines {
        println!("chassis release: hook {stage}: {line}");
        let status = build(dir, line, env)?
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()
            .map_err(|e| {
                Error::dependency(
                    format!("cannot run release hook `{line}` ({stage}): {e}"),
                    "is the script there and executable? Paths are relative to the project root",
                )
            })?;
        if !status.success() {
            return Err(failed(stage, line, status));
        }
    }
    Ok(())
}

/// Runs the tag-notes hook and returns its stdout, the text of the tag's
/// annotation. Its stderr is shown; empty output is refused, because an
/// annotated tag with no message cannot be created.
pub fn tag_notes(dir: &Path, line: &str, env: &HookEnv<'_>) -> Result<String, Error> {
    println!("chassis release: hook tag_notes: {line}");
    let out = build(dir, line, env)?
        .stdin(Stdio::inherit())
        .stderr(Stdio::inherit())
        .output()
        .map_err(|e| {
            Error::dependency(
                format!("cannot run release hook `{line}` (tag_notes): {e}"),
                "is the script there and executable? Paths are relative to the project root",
            )
        })?;
    if !out.status.success() {
        return Err(failed("tag_notes", line, out.status));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() {
        return Err(Error::config(
            format!("release hook `{line}` (tag_notes) printed nothing"),
            "it must print the annotation text on stdout; to tag without one, remove tag_notes",
        ));
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env() -> HookEnv<'static> {
        HookEnv {
            version: "1.2.3",
            tag: "v1.2.3",
            dry_run: true,
        }
    }

    fn script(dir: &Path, name: &str, body: &str) {
        use std::os::unix::fs::PermissionsExt;
        let p = dir.join(name);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[test]
    fn hooks_run_in_order_from_the_root_with_the_release_in_their_environment() {
        let d = tempfile::tempdir().unwrap();
        script(
            d.path(),
            "scripts/a",
            "echo \"a $1 $CHASSIS_RELEASE_VERSION $CHASSIS_RELEASE_TAG $CHASSIS_RELEASE_DRY_RUN\" >> order.txt",
        );
        script(d.path(), "scripts/b", "echo b >> order.txt");
        run_stage(
            d.path(),
            "pre_gate",
            &["scripts/a --run".into(), "scripts/b".into()],
            &env(),
        )
        .unwrap();
        let log = std::fs::read_to_string(d.path().join("order.txt")).unwrap();
        assert_eq!(log, "a --run 1.2.3 v1.2.3 1\nb\n");
    }

    #[test]
    fn a_failing_hook_stops_the_stage_and_names_itself() {
        let d = tempfile::tempdir().unwrap();
        script(d.path(), "scripts/bad", "exit 3");
        script(d.path(), "scripts/after", "touch ran-after");
        let e = run_stage(
            d.path(),
            "post_gate",
            &["scripts/bad".into(), "scripts/after".into()],
            &env(),
        )
        .unwrap_err();
        assert!(e.message.contains("scripts/bad"), "{}", e.message);
        assert!(e.message.contains("post_gate"), "{}", e.message);
        assert!(
            !d.path().join("ran-after").exists(),
            "later hooks do not run"
        );
    }

    #[test]
    fn a_missing_script_is_a_dependency_error_with_a_remedy() {
        let d = tempfile::tempdir().unwrap();
        let e = run_stage(d.path(), "pre_gate", &["scripts/nope".into()], &env()).unwrap_err();
        assert!(e.remedy.contains("executable"), "{}", e.remedy);
    }

    #[test]
    fn tag_notes_returns_stdout_and_refuses_failure_or_silence() {
        let d = tempfile::tempdir().unwrap();
        script(
            d.path(),
            "ok",
            "echo \"override record for $CHASSIS_RELEASE_TAG\"",
        );
        script(d.path(), "empty", "true");
        script(d.path(), "fail", "echo partial; exit 1");
        assert!(
            tag_notes(d.path(), "ok", &env()).is_err(),
            "a bare name is searched on PATH, not in the project"
        );
        assert_eq!(
            tag_notes(d.path(), "./ok", &env()).unwrap(),
            "override record for v1.2.3"
        );
        assert!(tag_notes(d.path(), "./empty", &env()).is_err());
        assert!(tag_notes(d.path(), "./fail", &env()).is_err());
    }
}
