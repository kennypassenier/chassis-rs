//! `chassis sync --protect`: set branch protection on `main` through `gh` and
//! read it back. Its own module because it is the one place the CLI writes to
//! GitHub settings rather than to the project's files.

use std::process::Command;

use chassis::Error;

use crate::drift;
use crate::process::require_tool;
use crate::recorded::Recorded;

/// Sets branch protection on `main` (no force-push, no deletion, no required
/// checks) and verifies that GitHub reports exactly that.
pub(crate) fn protect_main(rec: &Recorded) -> Result<(), Error> {
    require_tool("gh", "install the GitHub CLI and run `gh auth login`")?;
    put_protection(rec)?;
    read_back_protection(rec)
}

/// The `PUT` that writes the protection.
fn put_protection(rec: &Recorded) -> Result<(), Error> {
    let body = serde_json::json!({
        // 3.0.0: no required checks. The gates run on this machine before a
        // commit and before a release; a required check no workflow produces
        // would leave every non-admin path to main waiting forever. See
        // drift::Protection::expected.
        "required_status_checks": null,
        "enforce_admins": false,
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
            "is gh logged in with admin rights on this repository (`gh auth status`)? Then retry",
        ));
    }
    Ok(())
}

/// Rule 13a: read it back.
fn read_back_protection(rec: &Recorded) -> Result<(), Error> {
    match drift::fetch_protection(&rec.repo)? {
        Some(actual) => {
            let left = drift::protection_drift(&drift::Protection::expected(), &actual);
            if !left.is_empty() {
                for d in &left {
                    println!("{d}");
                }
                return Err(Error::dependency(
                    "branch protection was written but reads back different",
                    "run `gh api repos/<owner>/<name>/branches/main/protection` and compare with the lines above",
                ));
            }
            println!(
                "branch protection on {} main: no force-push, no deletion, no required checks",
                rec.repo
            );
        }
        None => {
            return Err(Error::dependency(
                "branch protection was written but main reads back unprotected",
                "retry; if it persists, set it in the repository's branch settings",
            ));
        }
    }
    Ok(())
}
