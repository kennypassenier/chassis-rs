//! What `chassis release` proves before it changes anything: the files the
//! release needs exist, the tools are installed, the tree is clean and the
//! tag is free. Its own module because every check here is a refusal that
//! leaves the project exactly as it was.

use std::path::Path;

use chassis::Error;

use crate::process::{capture, require_tool};
use crate::release;

/// CF-6 (2026-09-06): a release builds the container image, so a project
/// without a `Dockerfile` is refused before anything is gated, bumped or
/// tagged (kyu-runner's first v0.2.0 lost a tag to exactly that). Since
/// 3.0.0 the image is always built, here, so the check no longer depends on
/// what a workflow file happens to say, and no CI workflow is required.
pub(crate) fn check_release_files(dir: &Path, image: bool, sign: bool) -> Result<(), Error> {
    if image && !dir.join("Dockerfile").exists() {
        return Err(Error::config(
            "the release builds a container image but the repository has no Dockerfile",
            "run `chassis sync --write` to add the scaffold Dockerfile (and .dockerignore)",
        ));
    }
    if sign && !dir.join("scripts/sign-release.sh").exists() {
        return Err(Error::config(
            "the release ends with scripts/sign-release.sh, and the repository has none",
            "run `chassis sync --write` to add the scaffold's sign script",
        ));
    }
    Ok(())
}

/// Everything the release needs on this machine, before it changes anything.
pub(crate) fn require_release_tools(dir: &Path, dry_run: bool) -> Result<(), Error> {
    require_tool("git", "install git")?;
    require_tool(
        "docker",
        "install docker (the release binary and the image are built in containers)",
    )?;
    if !release::cargo_plugin_available(dir, "deny") {
        return Err(Error::config(
            "`cargo deny` is not available on this machine",
            "cargo install cargo-deny --locked (the release gate runs it, as CI did)",
        ));
    }
    if !dry_run {
        require_tool("gh", "install the GitHub CLI and run `gh auth login`")?;
        require_tool(
            "minisign",
            "install minisign (the signing key stays on this machine)",
        )?;
    }
    Ok(())
}

/// A clean tree on `main` with a free tag. A dry run may be on another
/// branch (it says so) and does not look at origin.
pub(crate) fn require_clean_tree_and_free_tag(
    dir: &Path,
    tag: &str,
    dry_run: bool,
) -> Result<(), Error> {
    // Clean in both modes: a dry run puts Cargo.toml and Cargo.lock back
    // afterwards, which is only safe over a tree that held nothing else.
    let status = capture(dir, "git", &["status", "--porcelain"])?;
    if !status.trim().is_empty() {
        return Err(Error::invalid(
            "the working tree is not clean",
            "commit or stash first; a release is cut from a committed tree",
        ));
    }
    let branch = capture(dir, "git", &["rev-parse", "--abbrev-ref", "HEAD"])?;
    if branch.trim() != "main" {
        if !dry_run {
            return Err(Error::invalid(
                format!("on branch `{}`, not main", branch.trim()),
                "release from main so the tag lands on the mainline (PROCEDURE: tag the merge commit)",
            ));
        }
        println!(
            "chassis release: dry run on branch `{}`; a real release refuses anything but main",
            branch.trim()
        );
    }
    if capture(
        dir,
        "git",
        &["rev-parse", "-q", "--verify", &format!("refs/tags/{tag}")],
    )
    .is_ok()
    {
        return Err(Error::invalid(
            format!("tag {tag} already exists here"),
            "pick the next version; a released tag is never moved",
        ));
    }
    if !dry_run {
        let remote = capture(
            dir,
            "git",
            &["ls-remote", "--tags", "origin", &format!("refs/tags/{tag}")],
        )?;
        if !remote.trim().is_empty() {
            return Err(Error::invalid(
                format!("tag {tag} already exists on origin"),
                "pick the next version; a released tag is never moved",
            ));
        }
    }
    Ok(())
}
