//! The steps of `chassis release` that prepare the tree: the pre_gate hooks,
//! reading and writing the bumped files, the release commit and its tag. Its
//! own module so `release_flow` reads as the order of the stages only.

use std::path::Path;

use chassis::Error;
use chassis::core::update::Version;

use super::{Bumped, Release};
use crate::manifest_version::{bump_version, current_version};
use crate::process::run;
use crate::release_changelog::{check_major_has_migration, release_changelog, today};
use crate::release_hooks;
use crate::render::io_err;

pub(super) fn hook_env<'a>(version: &'a str, ctx: &'a Release<'_>) -> release_hooks::HookEnv<'a> {
    release_hooks::HookEnv {
        version,
        tag: &ctx.tag,
        dry_run: ctx.dry_run,
    }
}

/// Reads Cargo.toml and CHANGELOG.md, computes the bumped Cargo.toml and
/// refuses a major bump without a Migration section.
pub(super) fn read_files_to_bump(dir: &Path, v: Version) -> Result<Bumped, Error> {
    let cargo_path = dir.join("Cargo.toml");
    let cargo = std::fs::read_to_string(&cargo_path).map_err(|e| io_err(&cargo_path, e))?;
    let current = current_version(&cargo)?;
    let bumped_cargo = bump_version(&cargo, &v.to_string())?;
    let changelog_path = dir.join("CHANGELOG.md");
    let changelog = std::fs::read_to_string(&changelog_path).unwrap_or_default();
    check_major_has_migration(&changelog, current, v)?;
    Ok(Bumped {
        cargo_path,
        bumped_cargo,
        changelog_path,
        changelog,
    })
}

/// 0b. The project's own checks (homelab-shared-4): pre_gate hooks, and
/// the tag annotation text, before anything is gated or changed.
pub(super) fn run_pre_gate_hooks(ctx: &Release<'_>) -> Result<Option<String>, Error> {
    let version = ctx.version.to_string();
    let env = hook_env(&version, ctx);
    let hooks = &ctx.rec.release.hooks;
    release_hooks::run_stage(ctx.dir, "pre_gate", &hooks.pre_gate, &env)?;
    match &hooks.tag_notes {
        Some(line) => Ok(Some(release_hooks::tag_notes(ctx.dir, line, &env)?)),
        None => Ok(None),
    }
}

/// Writes the bumped Cargo.toml (and, for real, the dated changelog) and
/// refreshes the lock file.
pub(super) fn write_bumped_files(ctx: &Release<'_>, files: &Bumped) -> Result<(), Error> {
    std::fs::write(&files.cargo_path, &files.bumped_cargo)
        .map_err(|e| io_err(&files.cargo_path, e))?;
    if !ctx.dry_run {
        let dated = release_changelog(&files.changelog, &ctx.version.to_string(), &today());
        std::fs::write(&files.changelog_path, dated)
            .map_err(|e| io_err(&files.changelog_path, e))?;
    }
    // The lock file must carry the new version or the gates refuse the tree (rule 7).
    run(ctx.dir, "cargo", &["update", "-w", "--offline"], true)
        .or_else(|_| run(ctx.dir, "cargo", &["update", "-w"], false))
}

/// Commits the bump through the project's hooks and tags it, annotated when
/// the project's `tag_notes` hook produced a record.
pub(super) fn commit_and_tag(ctx: &Release<'_>, annotation: Option<&str>) -> Result<(), Error> {
    let (dir, tag, v) = (ctx.dir, &ctx.tag, ctx.version);
    run(
        dir,
        "git",
        &["commit", "-qam", &format!("chore(release): {v} [meta]")],
        false,
    )?;
    match annotation {
        // An annotated tag carries the project's record (an override
        // list, say); without tag_notes it stays the plain tag.
        Some(text) => {
            let msg = dir
                .join(ctx.rec.release.target_dir())
                .join("tag-message.txt");
            if let Some(parent) = msg.parent() {
                std::fs::create_dir_all(parent).map_err(|e| io_err(&msg, e))?;
            }
            std::fs::write(&msg, format!("{text}\n")).map_err(|e| io_err(&msg, e))?;
            let msg_arg = msg.display().to_string();
            run(dir, "git", &["tag", "-a", tag, "-F", &msg_arg], false)
        }
        None => run(dir, "git", &["tag", tag], false),
    }
}
