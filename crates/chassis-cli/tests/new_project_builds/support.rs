//! Small helpers for the `chassis new` end-to-end tests: the command under
//! test, a command that acts on a given repository, and the Cargo.toml edit
//! that stands in for a project pinned to a foreign kit tag.

use std::process::Command;

pub fn chassis() -> Command {
    Command::new(env!("CARGO_BIN_EXE_chassis"))
}

/// A command that acts on the repository at `dir`, whatever git exported
/// to this test: from a pre-commit hook in a linked worktree the test
/// inherits `GIT_DIR` (+ `GIT_INDEX_FILE`), and `git log` in a temp dir
/// would otherwise read the kit's own history.
pub fn in_repo(program: &str, dir: &std::path::Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.current_dir(dir);
    for var in ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"] {
        cmd.env_remove(var);
    }
    cmd
}

/// Turns the scaffold's `chassis = { path = "…", version = "…", … }` line into a
/// git dependency pinned to a tag nobody has, without pulling in a regex crate.
pub fn regex_free_replace_path_dep(cargo_toml: &str) -> String {
    let Some(start) = cargo_toml.find("path = \"") else {
        return cargo_toml.to_string();
    };
    let rest = &cargo_toml[start + "path = \"".len()..];
    let Some(end) = rest.find('"') else {
        return cargo_toml.to_string();
    };
    format!(
        "{}git = \"https://example.invalid/kit.git\", tag = \"v0.0.9\"{}",
        &cargo_toml[..start],
        &rest[end + 1..]
    )
}
