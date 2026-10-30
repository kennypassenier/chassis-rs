//! Branch protection on `main`: what the kit sets, how a GitHub payload parses
//! and how the two compare. Its own module because it is the only drift that
//! needs the network, and only when `sync --remote` asks for it.

use std::process::Command;

use chassis::Error;

use super::Drift;

// ───────────────────────── branch protection ─────────────────────────

/// The part of GitHub's branch protection the kit owns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Protection {
    pub checks: Vec<String>,
    /// "Require branches to be up to date before merging".
    pub strict: bool,
    pub enforce_admins: bool,
}

impl Protection {
    /// What `chassis sync --protect` sets.
    ///
    /// No required checks since 3.0.0 (Kenny, 2026-09-29: tests and release
    /// builds run locally). A required check that no workflow produces
    /// leaves every path to `main` but an admin's direct push waiting
    /// forever, so the list is empty and `strict` with it. What protection
    /// still holds is the only irreversible part: no force-push, no
    /// deletion of `main`.
    ///
    /// `enforce_admins` stays FALSE (Kenny, 2026-09-10: "beheerders erlangs
    /// laten"): the two people who touch these repositories push to main.
    pub fn expected() -> Self {
        Self {
            checks: Vec::new(),
            strict: false,
            enforce_admins: false,
        }
    }
}

/// Reads `GET repos/<repo>/branches/main/protection` into a `Protection`.
pub fn parse_protection(json: &str) -> Result<Protection, Error> {
    let v: serde_json::Value = serde_json::from_str(json).map_err(|e| {
        Error::dependency(
            format!("the branch protection response is not JSON: {e}"),
            "run `gh api repos/<owner>/<name>/branches/main/protection` by hand and read what GitHub answers",
        )
    })?;
    let status = &v["required_status_checks"];
    let mut checks: Vec<String> = status["contexts"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|c| c.as_str().map(str::to_string))
        .collect();
    // Newer payloads carry `checks[].context` next to (or instead of) `contexts`.
    for c in status["checks"].as_array().into_iter().flatten() {
        if let Some(name) = c["context"].as_str()
            && !checks.iter().any(|k| k == name)
        {
            checks.push(name.to_string());
        }
    }
    Ok(Protection {
        checks,
        strict: status["strict"].as_bool().unwrap_or(false),
        enforce_admins: v["enforce_admins"]["enabled"].as_bool().unwrap_or(false),
    })
}

const PROTECT_REMEDY: &str = "run `chassis sync --protect` (sets the kit's protection: no required checks, not strict, admins not enforced, and reads it back)";

/// Compares what protection requires with what the kit sets: one line per
/// missing check, extra check, and per flag that differs.
pub fn protection_drift(expected: &Protection, actual: &Protection) -> Vec<Drift> {
    let mut out = Vec::new();
    for missing in expected
        .checks
        .iter()
        .filter(|c| !actual.checks.contains(c))
    {
        out.push(Drift::new(
            "branch protection",
            format!("does not require `{missing}`"),
            "a check of that name that main must wait for".into(),
            PROTECT_REMEDY.into(),
        ));
    }
    for extra in actual
        .checks
        .iter()
        .filter(|c| !expected.checks.contains(c))
    {
        out.push(Drift::new(
            "branch protection",
            format!("requires `{extra}`"),
            "no CI job produces it (the kit ships no CI since 3.0.0; main could never merge on it)"
                .into(),
            PROTECT_REMEDY.into(),
        ));
    }
    if expected.strict != actual.strict {
        out.push(Drift::new(
            "branch protection",
            format!("strict = {}", actual.strict),
            format!("strict = {}", expected.strict),
            PROTECT_REMEDY.into(),
        ));
    }
    if expected.enforce_admins != actual.enforce_admins {
        out.push(Drift::new(
            "branch protection",
            format!("enforce_admins = {}", actual.enforce_admins),
            format!("enforce_admins = {}", expected.enforce_admins),
            PROTECT_REMEDY.into(),
        ));
    }
    out
}

/// `sync --remote`: the current protection of `main`, or `None` when the
/// branch is not protected at all. Needs `gh` logged in.
pub fn fetch_protection(repo: &str) -> Result<Option<Protection>, Error> {
    let out = Command::new("gh")
        .args([
            "api",
            &format!("repos/{repo}/branches/main/protection"),
        ])
        .output()
        .map_err(|e| {
            Error::dependency(
                format!("cannot run gh: {e}"),
                "install the GitHub CLI and run `gh auth login`, or drop --remote (sync stays offline without it)",
            )
        })?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    if out.status.success() {
        return parse_protection(&stdout).map(Some);
    }
    // gh prints GitHub's JSON error on stdout and its own summary on stderr;
    // an unprotected branch is a 404 with this message, not a failure.
    if stdout.contains("Branch not protected") || stderr.contains("Branch not protected") {
        return Ok(None);
    }
    Err(Error::dependency(
        format!(
            "gh api repos/{repo}/branches/main/protection failed: {}",
            stderr.trim()
        ),
        "is gh logged in (`gh auth status`) with access to this repository?",
    ))
}

/// Everything `--remote` compares, as drift lines.
pub fn remote_drift(repo: &str) -> Result<Vec<Drift>, Error> {
    let expected = Protection::expected();
    Ok(match fetch_protection(repo)? {
        Some(actual) => protection_drift(&expected, &actual),
        None => vec![Drift::new(
            "branch protection",
            "main is not protected".into(),
            "main protected against a force-push and a deletion".into(),
            "run `chassis sync --protect`".into(),
        )],
    })
}

#[cfg(test)]
mod tests;
