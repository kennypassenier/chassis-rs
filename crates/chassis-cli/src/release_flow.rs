//! `chassis release <version>`: the sequence itself. The refusals before it
//! changes anything are in `release_preflight`, the plan in `release_plan`,
//! the builds and uploads in `release`; this module only orders them and
//! decides what to undo, so the order can be read in one place.

use std::path::{Path, PathBuf};

use chassis::Error;
use chassis::core::update::Version;

use crate::failed_tests;
use crate::manifest_version::{bump_version, current_version};
use crate::process::{capture, run, run_interactive};
use crate::recorded::Recorded;
use crate::release;
use crate::release_changelog::{check_major_has_migration, release_changelog, today};
use crate::release_hooks;
use crate::release_plan::{print_dry_run_summary, print_plan};
use crate::release_preflight::{
    check_release_files, require_clean_tree_and_free_tag, require_release_tools,
};
use crate::release_restore::Restore;
use crate::render::io_err;
use crate::sync::read_recorded;

/// What one release run is about, shared by its stages.
struct Release<'a> {
    dir: &'a Path,
    rec: &'a Recorded,
    version: Version,
    tag: String,
    image: bool,
    dry_run: bool,
}

/// The project files a release bumps, read before anything is changed.
struct Bumped {
    cargo_path: PathBuf,
    bumped_cargo: String,
    changelog_path: PathBuf,
    changelog: String,
}

pub(crate) fn cmd_release(
    dir: &Path,
    version: &str,
    dry_run: bool,
    plan: bool,
    full_tests: bool,
) -> Result<(), Error> {
    let rec = read_recorded(dir)?;
    let v = Version::parse(version)?;
    let tag = format!("v{v}");
    let (image, why) = release::wants_image(dir, &rec);
    println!(
        "chassis release: container image: {} ({why})",
        if image { "yes" } else { "no" }
    );
    rec.release.validate()?;
    check_release_files(dir, image, rec.release.sign)?;
    if plan {
        return print_plan(dir, &rec, v, &tag, image);
    }

    // 0. Everything the release needs, before it changes anything.
    require_release_tools(dir, dry_run)?;
    require_clean_tree_and_free_tag(dir, &tag, dry_run)?;
    let files = read_files_to_bump(dir, v)?;

    let ctx = Release {
        dir,
        rec: &rec,
        version: v,
        tag,
        image,
        dry_run,
    };
    let annotation = run_pre_gate_hooks(&ctx)?;

    // 1. The gate: everything the kit's CI workflow ran, on this tree.
    release::gate(dir, &rec, image, full_tests)?;
    let version_text = v.to_string();
    let env = hook_env(&version_text, &ctx);
    release_hooks::run_stage(dir, "post_gate", &rec.release.hooks.post_gate, &env)?;

    // 2. Bump Cargo.toml (and, for real, the changelog). A dry run builds
    // the bumped version too, so the binary and the image it proves answer
    // with the version being released, and then puts both files back.
    let _restore =
        dry_run.then(|| Restore::snapshot(&[&files.cargo_path, &dir.join("Cargo.lock")]));
    write_bumped_files(&ctx, &files)?;

    // 3. Commit through the hooks and tag, locally. Nothing leaves this
    // machine until every asset is built and verified.
    if !dry_run {
        commit_and_tag(&ctx, annotation.as_deref())?;
    }
    let sha = capture(dir, "git", &["rev-parse", "HEAD"])?
        .trim()
        .to_string();
    let undo = format!(
        "nothing was pushed. Undo the local release with `git tag -d {0} && git reset --hard HEAD~1`, fix it, and run `chassis release {v}` again",
        ctx.tag
    );
    let images = match build_assets(&ctx, &files.cargo_path, &sha) {
        Ok(images) => images,
        Err(e) if !dry_run => {
            return Err(Error::dependency(
                e.message,
                format!("{} — {undo}", e.remedy),
            ));
        }
        Err(e) => return Err(e),
    };

    if dry_run {
        print_dry_run_summary(ctx.rec, &ctx.tag, ctx.version, images.as_ref());
        return Ok(());
    }
    publish_and_sign(&ctx, &sha, &undo, images.as_ref())
}

fn hook_env<'a>(version: &'a str, ctx: &'a Release<'_>) -> release_hooks::HookEnv<'a> {
    release_hooks::HookEnv {
        version,
        tag: &ctx.tag,
        dry_run: ctx.dry_run,
    }
}

/// Reads Cargo.toml and CHANGELOG.md, computes the bumped Cargo.toml and
/// refuses a major bump without a Migration section.
fn read_files_to_bump(dir: &Path, v: Version) -> Result<Bumped, Error> {
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
fn run_pre_gate_hooks(ctx: &Release<'_>) -> Result<Option<String>, Error> {
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
fn write_bumped_files(ctx: &Release<'_>, files: &Bumped) -> Result<(), Error> {
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
fn commit_and_tag(ctx: &Release<'_>, annotation: Option<&str>) -> Result<(), Error> {
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

/// 4. What release.yml built: the static binary, SHA256SUMS, the image.
fn build_assets(
    ctx: &Release<'_>,
    cargo_path: &Path,
    sha: &str,
) -> Result<Option<[String; 2]>, Error> {
    let (dir, rec, tag) = (ctx.dir, ctx.rec, &ctx.tag);
    // release.yml's first step: the tag names the version Cargo.toml says.
    let at_tag = if ctx.dry_run {
        std::fs::read_to_string(cargo_path).map_err(|e| io_err(cargo_path, e))?
    } else {
        capture(dir, "git", &["show", &format!("{tag}:Cargo.toml")])?
    };
    release::check_tag_matches(tag, &current_version(&at_tag)?.to_string())?;
    release::build_binary(dir, rec)?;
    let images = if ctx.image {
        Some(release::build_image(dir, rec, tag)?)
    } else {
        None
    };
    release::write_notes(dir, rec, sha)?;
    Ok(images)
}

/// 5. Publish: main, the tag, the image, the release; then 6. sign.
fn publish_and_sign(
    ctx: &Release<'_>,
    sha: &str,
    undo: &str,
    images: Option<&[String; 2]>,
) -> Result<(), Error> {
    let (dir, rec, tag) = (ctx.dir, ctx.rec, &ctx.tag);
    run(dir, "git", &["push", "-q", "origin", "HEAD:main"], false).map_err(|e| {
        Error::dependency(
            e.message,
            format!("main did not move (is origin/main ahead of this checkout?); {undo}"),
        )
    })?;
    run(dir, "git", &["push", "-q", "origin", tag], false)?;
    println!("chassis release: pushed {sha} to main and tagged it {tag}");
    release::publish(dir, rec, tag, images)?;
    // The tests this release carried are behind it now.
    failed_tests::clear(dir);

    // 6. Sign locally and upload .minisig before VERSION. Interactive: minisign
    // prints its password prompt and must be seen where there is a terminal.
    if rec.release.sign {
        run_interactive(dir, "scripts/sign-release.sh", &[tag])?;
    } else {
        println!(
            "chassis release: signing is left to you ([release] sign = false): the release is unsigned until you sign {tag}"
        );
    }
    println!("released {} {tag}", rec.name);
    Ok(())
}
