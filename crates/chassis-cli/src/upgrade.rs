//! `chassis upgrade <version>` (feat-sync-1): the kit version in one step.
//! Its own module because it is the one command that edits `Cargo.toml`, and
//! the boundary around that file is the reason `sync` can be trusted.

use std::path::{Path, PathBuf};

use chassis::Error;

use crate::drift;
use crate::process::run;

/// `chassis upgrade <version>` (feat-sync-1): the kit version in one step.
///
/// Why a command of its own rather than `sync --write`: Cargo.toml belongs to
/// the project, and that boundary is one the consumers name as a reason to
/// trust sync. This touches exactly the lines that carry the kit's version
/// and nothing else in the file.
pub(crate) fn cmd_upgrade(dir: &Path, version: &str, no_verify: bool) -> Result<(), Error> {
    let tag = if version.starts_with('v') {
        version.to_string()
    } else {
        format!("v{version}")
    };

    let (record_path, record) = read_project_file(
        dir,
        ".chassis.toml",
        "run `chassis upgrade` in the project root, next to .chassis.toml",
    )?;
    let (cargo_path, cargo) = read_project_file(
        dir,
        "Cargo.toml",
        "run `chassis upgrade` in the project root",
    )?;
    refuse_path_dependency(&cargo)?;

    let new_record = drift::set_chassis_tag(&record, &tag)?;
    let new_cargo = drift::set_kit_dependency(&cargo, &tag);
    if new_cargo == cargo && new_record == record {
        println!("chassis upgrade: already on {tag}; nothing to change");
    }
    drift::write_atomically(&record_path, &new_record)?;
    drift::write_atomically(&cargo_path, &new_cargo)?;
    println!("chassis upgrade: .chassis.toml and Cargo.toml now name {tag}");

    check_every_line_moved(&cargo, &new_cargo, &tag)?;

    if no_verify {
        println!("chassis upgrade: --no-verify, so cargo and the gates were not run");
        return Ok(());
    }
    verify(dir, &tag)
}

/// Reads one of the two files the upgrade edits, naming `remedy` when the
/// command was started outside a project root.
fn read_project_file(dir: &Path, name: &str, remedy: &str) -> Result<(PathBuf, String), Error> {
    let path = dir.join(name);
    let text = std::fs::read_to_string(&path).map_err(|e| {
        Error::config(
            format!("cannot read {}: {e}", path.display()),
            remedy.to_string(),
        )
    })?;
    Ok((path, text))
}

/// A path dependency is a local checkout, and a version means nothing to
/// it: moving the tag would claim something the build does not do.
fn refuse_path_dependency(cargo: &str) -> Result<(), Error> {
    if let drift::KitDependency::Path(path) = drift::kit_dependency(cargo)? {
        return Err(Error::config(
            format!("the chassis dependency is a local checkout ({path}), not a tag"),
            "this project builds against a working tree, so there is no version to move; point it back at a tag first",
        ));
    }
    Ok(())
}

/// Both lines, measured rather than assumed: a project that moves one and
/// forgets the other builds against two kit versions, and `sync` reads
/// only `[dependencies]` so it cannot say so.
fn check_every_line_moved(cargo: &str, new_cargo: &str, tag: &str) -> Result<(), Error> {
    let moved = new_cargo.matches(&format!("tag = \"{tag}\"")).count();
    let expected = cargo.matches("tag = \"").count();
    if moved != expected {
        return Err(Error::internal(
            format!("{moved} of {expected} chassis dependency lines carry {tag}"),
            "check Cargo.toml by hand: every chassis line (the dependency and the dev-dependency) must name the same tag",
        ));
    }
    Ok(())
}

/// Resolves the new tag with cargo and runs the project's own gates.
fn verify(dir: &Path, tag: &str) -> Result<(), Error> {
    println!("chassis upgrade: cargo update -p chassis");
    run(dir, "cargo", &["update", "-p", "chassis"], false).map_err(|e| {
        Error::dependency(
            format!("cargo could not resolve {tag}: {}", e.message),
            "does that tag exist on the kit's repository? `git ls-remote --tags <chassis repo>` lists them",
        )
    })?;

    let gates = dir.join(".claude/hooks/gates.sh");
    if gates.is_file() {
        println!("chassis upgrade: .claude/hooks/gates.sh");
        run(dir, "bash", &[".claude/hooks/gates.sh"], false)?;
    } else {
        println!("chassis upgrade: no gates script; cargo test --workspace");
        run(dir, "cargo", &["test", "--workspace"], false)?;
    }
    println!("chassis upgrade: on {tag}, gates green. Next: chassis sync --write");
    Ok(())
}
