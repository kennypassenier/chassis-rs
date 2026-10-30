//! `chassis sync`: compare a project with the current scaffold and report the
//! drift that is not a file. The orchestration lives here; the per-file diff
//! and the obsolete-file removal are in `sync_files`, branch protection in
//! `protect`.

use std::path::Path;

use chassis::Error;

use crate::drift;
use crate::process::require_tool;
use crate::protect::protect_main;
use crate::recorded::Recorded;
use crate::render::io_err;
use crate::sync_files::{remove_obsolete_files, sync_rendered_files};

/// Reads the record `new` wrote, for every command that works on a project.
pub(crate) fn read_recorded(dir: &Path) -> Result<Recorded, Error> {
    let path = dir.join(".chassis.toml");
    let text = std::fs::read_to_string(&path).map_err(|e| {
        Error::config(
            format!("cannot read {}: {e}", path.display()),
            "run `chassis sync` inside a project created with `chassis new`, or write .chassis.toml by hand (see the scaffold README)",
        )
    })?;
    toml::from_str(&text)
        .map_err(|e| Error::config(format!(".chassis.toml does not parse: {e}"), "fix the file"))
}

/// What `sync` found (K32, D1 2026-09-07). `changed`: a difference existed.
/// `unresolved`: a difference is still there when this run ends — file drift
/// that was not written, or drift `--write` cannot fix (the kit tag in
/// Cargo.toml, a branch protection without `--protect`). Scripts and CI read
/// the exit code, so `unresolved` is what decides exit 1, `--write` or not.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct SyncOutcome {
    pub(crate) changed: bool,
    pub(crate) unresolved: bool,
}

/// Returns whether any kit-owned file, or anything K32 compares, differed.
pub(crate) fn cmd_sync(
    dir: &Path,
    write: bool,
    force: bool,
    protect: bool,
    remote: bool,
) -> Result<SyncOutcome, Error> {
    let mut rec = read_recorded(dir)?;
    if remote {
        require_tool(
            "gh",
            "install the GitHub CLI and run `gh auth login`, or drop --remote (sync stays offline without it)",
        )?;
    }
    let mut found = SyncOutcome {
        changed: false,
        unresolved: false,
    };
    sync_kp_themes(dir, &mut rec, write, &mut found)?;
    let cargo = read_cargo(dir)?;
    let features = kit_features_to_describe(&cargo)?;
    sync_rendered_files(dir, &rec, &features, write, force, &mut found)?;
    remove_obsolete_files(dir, write, &mut found)?;
    report_record_and_dependency_drift(&rec, &cargo, protect, remote, &mut found)?;
    if !found.changed {
        println!(
            "in sync with the scaffold of chassis {}",
            env!("CARGO_PKG_VERSION")
        );
    }
    if protect {
        protect_main(&rec)?;
    }
    Ok(found)
}

/// K32: the kp_themes record feeds the rendered files (docs/KIT.md names
/// the version), so it is compared — and with --write corrected — before
/// anything is rendered; corrected afterwards, it would leave a file
/// rendered from the stale record behind and the next sync would drift.
fn sync_kp_themes(
    dir: &Path,
    rec: &mut Recorded,
    write: bool,
    found: &mut SyncOutcome,
) -> Result<(), Error> {
    let vendored = drift::vendored_kp_themes();
    if let Some(d) = drift::kp_themes_drift(&rec.kp_themes, vendored) {
        found.changed = true;
        found.unresolved |= !write;
        println!("{d}");
        if write {
            // The kit is the source of truth for kp_themes, so --write may
            // correct the record; Cargo.toml stays project-owned (reported only).
            let path = dir.join(".chassis.toml");
            let text = std::fs::read_to_string(&path).map_err(|e| io_err(&path, e))?;
            drift::write_atomically(&path, &drift::set_kp_themes(&text, vendored)?)?;
            println!("  written");
            rec.kp_themes = vendored.to_string();
        }
    }
    Ok(())
}

/// K35: the project's own Cargo.toml decides which features the
/// generated documentation describes, so it is read BEFORE anything is
/// rendered — the same ordering lesson as kp_themes above.
fn read_cargo(dir: &Path) -> Result<String, Error> {
    let cargo_path = dir.join("Cargo.toml");
    std::fs::read_to_string(&cargo_path).map_err(|e| {
        Error::config(
            format!("cannot read {}: {e}", cargo_path.display()),
            "run `chassis sync` in the project root, next to .chassis.toml",
        )
    })
}

/// The kit features the project builds, or every feature when it names none.
fn kit_features_to_describe(cargo: &str) -> Result<Vec<String>, Error> {
    Ok(match drift::kit_features(cargo)? {
        Some(features) => features,
        None => {
            // No chassis dependency to read: `kit_tag_drift` reports
            // that with its remedy. Describing every feature is the honest
            // answer here — narrowing the document on a guess would hide
            // knobs the project may well have (rule 30).
            println!(
                "~ Cargo.toml: no chassis dependency, so docs/KIT.md is rendered for every kit feature"
            );
            drift::KIT_FEATURES
                .iter()
                .map(|f| (*f).to_string())
                .collect()
        }
    })
}

/// K32: the remaining drift that is not a file, after the diffs and in one
/// shape: the obsolete `required_checks` line, the kit tag, and (with
/// `--remote`) branch protection.
fn report_record_and_dependency_drift(
    rec: &Recorded,
    cargo: &str,
    protect: bool,
    remote: bool,
    found: &mut SyncOutcome,
) -> Result<(), Error> {
    if let Some(d) = drift::required_checks_drift(&rec.required_checks) {
        // .chassis.toml keeps its comments, and the line usually carries one
        // explaining it; deleting it is left to the person reading this.
        found.changed = true;
        found.unresolved = true;
        println!("{d}");
    }
    let dep = drift::kit_dependency(cargo)?;
    if let drift::KitDependency::Path(path) = &dep {
        println!(
            "~ Cargo.toml: chassis is a path dependency ({path}); the kit tag is not compared"
        );
    }
    for d in drift::kit_tag_drift(&dep, &rec.chassis_tag) {
        // Cargo.toml is project-owned: --write never touches it, so this
        // stays unresolved until the project moves its pin.
        found.changed = true;
        found.unresolved = true;
        println!("{d}");
    }
    if remote {
        for d in drift::remote_drift(&rec.repo)? {
            found.changed = true;
            // --protect repairs the protection right after this; without it
            // the difference is only reported.
            found.unresolved |= !protect;
            println!("{d}");
        }
    }
    Ok(())
}
