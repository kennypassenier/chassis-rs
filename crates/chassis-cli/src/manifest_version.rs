//! Reading and writing the version `chassis release` bumps (moved out of
//! `main.rs` in homelab-shared-4). A package manifest keeps it under
//! `[package]`; a workspace root that has no package of its own keeps the
//! one shared version under `[workspace.package]`, which every member
//! inherits with `version.workspace = true`. `[package]` wins when both
//! exist, so a single-package project releases as it always did.

use chassis::Error;

const PACKAGE: &str = "[package]";
const WORKSPACE_PACKAGE: &str = "[workspace.package]";

fn has_version_in(cargo_toml: &str, section: &str) -> bool {
    let mut inside = false;
    for line in cargo_toml.lines() {
        if line.trim_start().starts_with('[') {
            inside = line.trim() == section;
        }
        if inside && is_version_line(line) {
            return true;
        }
    }
    false
}

/// `version = "…"` and not `version.workspace = true` or `versioned = …`.
fn is_version_line(line: &str) -> bool {
    let t = line.trim_start();
    t.strip_prefix("version")
        .is_some_and(|rest| rest.trim_start().starts_with('=') && rest.contains('"'))
}

/// The section whose version is the project's.
fn section_of(cargo_toml: &str) -> Result<&'static str, Error> {
    if has_version_in(cargo_toml, PACKAGE) {
        Ok(PACKAGE)
    } else if has_version_in(cargo_toml, WORKSPACE_PACKAGE) {
        Ok(WORKSPACE_PACKAGE)
    } else {
        Err(Error::config(
            "Cargo.toml has no version line under [package] or [workspace.package]",
            "add `version = \"x.y.z\"` under [package], or under [workspace.package] for a workspace",
        ))
    }
}

pub fn current_version(cargo_toml: &str) -> Result<chassis::core::update::Version, Error> {
    let section = section_of(cargo_toml)?;
    let mut inside = false;
    for line in cargo_toml.lines() {
        if line.trim_start().starts_with('[') {
            inside = line.trim() == section;
        }
        if inside
            && is_version_line(line)
            && let Some(v) = line.split('"').nth(1)
        {
            return chassis::core::update::Version::parse(v);
        }
    }
    unreachable!("section_of found a version line in this section")
}

pub fn bump_version(cargo_toml: &str, version: &str) -> Result<String, Error> {
    let section = section_of(cargo_toml)?;
    let mut out = String::new();
    let mut done = false;
    let mut inside = false;
    for line in cargo_toml.lines() {
        if line.trim_start().starts_with('[') {
            inside = line.trim() == section;
        }
        if inside && !done && is_version_line(line) {
            out.push_str(&format!("version = \"{version}\"\n"));
            done = true;
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PKG: &str = "[package]\nname = \"x\"\nversion = \"1.0.0\"\n\n[dependencies]\nserde = { version = \"1\" }\n";
    const WS: &str = "[workspace]\nmembers = [\"a\", \"b\"]\n\n[workspace.package]\nversion = \"4.1.2\"\nedition = \"2024\"\n\n[workspace.dependencies]\nserde = { version = \"1\" }\n";

    #[test]
    fn a_package_manifest_bumps_as_before() {
        assert_eq!(current_version(PKG).unwrap().to_string(), "1.0.0");
        let out = bump_version(PKG, "1.1.0").unwrap();
        assert!(out.contains("version = \"1.1.0\""));
        assert!(
            out.contains("serde = { version = \"1\" }"),
            "dependencies untouched"
        );
    }

    #[test]
    fn a_workspace_root_bumps_the_one_shared_version() {
        assert_eq!(current_version(WS).unwrap().to_string(), "4.1.2");
        let out = bump_version(WS, "4.2.0").unwrap();
        assert!(out.contains("[workspace.package]\nversion = \"4.2.0\"\nedition"));
        assert_eq!(out.matches("version = ").count(), 2, "only one line moved");
        assert!(out.contains("serde = { version = \"1\" }"));
    }

    #[test]
    fn package_wins_over_workspace_package_and_inherited_is_not_a_version() {
        let both = format!("{PKG}\n[workspace.package]\nversion = \"9.9.9\"\n");
        assert_eq!(current_version(&both).unwrap().to_string(), "1.0.0");
        let inherited = "[package]\nname = \"m\"\nversion.workspace = true\n";
        assert!(current_version(inherited).is_err(), "nothing to bump here");
    }

    #[test]
    fn no_version_is_refused_with_a_remedy() {
        let e = bump_version("[workspace]\nmembers = []\n", "1.0.0").unwrap_err();
        assert!(e.remedy.contains("[workspace.package]"), "{}", e.remedy);
    }
}
