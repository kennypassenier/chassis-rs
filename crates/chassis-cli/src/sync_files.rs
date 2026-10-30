//! The file half of `chassis sync`: diff each rendered scaffold file against
//! the project's copy (writing with `--write`), and remove the files the kit
//! wrote once and ships no more. Split from `sync` so the orchestration there
//! reads as a sequence of checks.

use std::path::Path;

use chassis::Error;

use crate::drift;
use crate::recorded::Recorded;
use crate::render::{
    dropped_unit_directives, io_err, merge_gitignore, render_all, with_chassis_path, write_file,
};
use crate::sync::SyncOutcome;

/// Diffs every rendered file against the project's copy and, with `write`,
/// applies the ones the kit owns.
pub(crate) fn sync_rendered_files(
    dir: &Path,
    rec: &Recorded,
    features: &[String],
    write: bool,
    force: bool,
    found: &mut SyncOutcome,
) -> Result<(), Error> {
    for (rel, body, exec, owned) in render_all(rec, features)? {
        let current = std::fs::read_to_string(dir.join(&rel)).unwrap_or_default();
        let body = if rel == "Cargo.toml" {
            with_chassis_path(&body, rec)
        } else if rel == ".gitignore" {
            merge_gitignore(&body, &current)
        } else {
            body
        };
        if current == body {
            continue;
        }
        // fix-4: "written once by `new`" means an absent file is still
        // written — creating is not overwriting, and for the shared hooks a
        // missing file is no gate at all, which is the fail-open rule 12
        // forbids. A migrated project never ran `new`, so this is the only
        // way it ever receives one (kyu-runner, 2026-09-10).
        if owned && !force && dir.join(&rel).exists() {
            println!(
                "~ {rel} (project-owned; differs from the scaffold, left alone — use --write --force to overwrite)"
            );
            continue;
        }
        if report_dropped_directives(&rel, &current, &body, force, found) {
            continue;
        }
        found.changed = true;
        found.unresolved |= !write;
        print_diff(&rel, &current, &body);
        if write {
            write_file(dir, &rel, &body, exec)?;
            println!("  written");
        }
    }
    Ok(())
}

/// fix-14: a unit directive the project added and the record does not
/// carry would vanish on --write. Refuse that file, name the lines and
/// where they belong, unless --force says to drop them. Returns whether the
/// file was refused.
fn report_dropped_directives(
    rel: &str,
    current: &str,
    body: &str,
    force: bool,
    found: &mut SyncOutcome,
) -> bool {
    let dropped = if rel.starts_with("deploy/") && rel.ends_with(".service") {
        dropped_unit_directives(current, body)
    } else {
        Vec::new()
    };
    if dropped.is_empty() || force {
        return false;
    }
    found.changed = true;
    found.unresolved = true;
    println!(
        "! {rel}: the project's own directives would be lost by --write, so it is left alone:"
    );
    for line in &dropped {
        println!("    {line}");
    }
    let quoted: Vec<String> = dropped.iter().map(|l| format!("{l:?}")).collect();
    println!(
        "  What now: add them to .chassis.toml as unit_service = [{}], then sync again (--write --force drops them instead)",
        quoted.join(", ")
    );
    true
}

/// The unified diff of one file, project on the left and scaffold on the right.
fn print_diff(rel: &str, current: &str, body: &str) {
    let diff = similar::TextDiff::from_lines(current, body);
    println!("--- {rel} (project)\n+++ {rel} (scaffold)");
    for hunk in diff.unified_diff().context_radius(2).iter_hunks() {
        print!("{hunk}");
    }
}

/// 3.0.0: files the kit wrote once and ships no more. They are kit-owned,
/// so a sync that only stopped writing them would leave them running —
/// a CI workflow nobody waits for and a release workflow racing the
/// local build for the same tag.
pub(crate) fn remove_obsolete_files(
    dir: &Path,
    write: bool,
    found: &mut SyncOutcome,
) -> Result<(), Error> {
    for obsolete in drift::OBSOLETE_FILES {
        let path = dir.join(obsolete.path);
        if !path.exists() {
            continue;
        }
        found.changed = true;
        found.unresolved |= !write;
        println!("{}", obsolete.drift());
        if write {
            std::fs::remove_file(&path).map_err(|e| io_err(&path, e))?;
            // An emptied `.github/workflows` (and `.github`) goes too; one
            // that still holds a project's own workflow stays.
            let mut parent = path.parent();
            while let Some(p) = parent {
                if p == dir || std::fs::remove_dir(p).is_err() {
                    break;
                }
                parent = p.parent();
            }
            println!("  removed");
        }
    }
    Ok(())
}
