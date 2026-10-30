//! What git and cargo say about the tree: the workspace's packages, the
//! files changed since the recorded run, the commit to record and the time.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use crate::process::capture;

/// `(name, dir relative to the workspace root)` of every workspace package.
pub fn workspace_packages(dir: &Path) -> Result<Vec<(String, String)>, String> {
    let json = capture(
        dir,
        "cargo",
        &["metadata", "--no-deps", "--format-version", "1"],
    )
    .map_err(|e| format!("cargo metadata failed ({})", e.message))?;
    let v: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| format!("cargo metadata unreadable: {e}"))?;
    let root = PathBuf::from(v["workspace_root"].as_str().unwrap_or_default());
    let mut out = Vec::new();
    for p in v["packages"].as_array().into_iter().flatten() {
        let (Some(name), Some(manifest)) = (p["name"].as_str(), p["manifest_path"].as_str()) else {
            continue;
        };
        let pkg_dir = Path::new(manifest).parent().unwrap_or(Path::new(""));
        let rel = pkg_dir
            .strip_prefix(&root)
            .map(|r| r.to_string_lossy().into_owned())
            .unwrap_or_default();
        out.push((name.to_string(), rel));
    }
    Ok(out)
}

/// Files that differ between the recorded tree and the working tree, plus
/// untracked files (counted as changed: the conservative side).
pub fn changed_since(dir: &Path, commit: &str) -> Result<Vec<String>, String> {
    let top = capture(dir, "git", &["rev-parse", "--show-toplevel"])
        .map_err(|e| e.message)?
        .trim()
        .to_string();
    let diff = capture(dir, "git", &["diff", "--name-only", commit, "--"])
        .map_err(|_| format!("cannot compare with the failed run's tree {commit}"))?;
    let untracked =
        capture(dir, "git", &["ls-files", "-o", "--exclude-standard"]).map_err(|e| e.message)?;
    // `git diff --name-only` is relative to the repo root, `ls-files` to dir.
    let abs_dir = std::fs::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf());
    let sub = abs_dir
        .strip_prefix(&top)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut out: BTreeSet<String> = BTreeSet::new();
    for l in diff.lines().filter(|l| !l.is_empty()) {
        let rel = if sub.is_empty() {
            Some(l)
        } else {
            l.strip_prefix(&format!("{sub}/"))
        };
        if let Some(r) = rel {
            out.insert(r.to_string());
        }
    }
    out.extend(
        untracked
            .lines()
            .filter(|l| !l.is_empty())
            .map(String::from),
    );
    Ok(out.into_iter().collect())
}

/// The tree to record: a commit holding the working tree when it is dirty
/// (`git stash create`), else HEAD.
pub fn snapshot_commit(dir: &Path) -> Option<String> {
    let stash = capture(dir, "git", &["stash", "create"]).ok()?;
    let stash = stash.trim();
    if !stash.is_empty() {
        return Some(stash.to_string());
    }
    Some(
        capture(dir, "git", &["rev-parse", "HEAD"])
            .ok()?
            .trim()
            .to_string(),
    )
}

pub fn now_utc(dir: &Path) -> String {
    capture(dir, "date", &["-u", "+%Y-%m-%dT%H:%M:%SZ"])
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "an unknown time".into())
}
