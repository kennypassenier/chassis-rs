//! The kit dependency in a project's `Cargo.toml`: which tag it pins, which
//! kit features it builds, and the rewrite `chassis upgrade` applies. Its own
//! module because everything here reads the project's manifest, not its record.

use chassis::Error;

use super::Drift;

// ───────────────────────── kit tag vs Cargo.toml ─────────────────────────

/// What a project's `Cargo.toml` says about the kit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KitDependency {
    /// `chassis = { git = …, tag = "vX.Y.Z", version = "X.Y.Z", … }` — the
    /// shape the scaffold writes. A bare `chassis = "X.Y.Z"` lands here with
    /// no tag, which is reported: the kit is not on crates.io.
    Git {
        tag: Option<String>,
        version: Option<String>,
    },
    /// A local checkout (drills, kit work): there is no tag to compare.
    Path(String),
    Missing,
}

fn parse_cargo(cargo_toml: &str) -> Result<toml::Table, Error> {
    cargo_toml.parse().map_err(|e| {
        Error::config(
            format!("Cargo.toml does not parse: {e}"),
            "fix the file; `cargo metadata` reports the same error with a line number",
        )
    })
}

/// The `chassis` entry of `[dependencies]`, or of `[workspace.dependencies]`
/// when the project keeps its versions there.
fn chassis_dep(table: &toml::Table) -> Option<&toml::Value> {
    table
        .get("dependencies")
        .and_then(|d| d.get("chassis"))
        .or_else(|| {
            table
                .get("workspace")
                .and_then(|w| w.get("dependencies"))
                .and_then(|d| d.get("chassis"))
        })
}

/// Every kit feature, in the order a document lists them. `assets` sits
/// after `dashboard` because that is what pulls it in; `webapp` and `push`
/// come last because each builds on the ones before.
pub const KIT_FEATURES: [&str; 9] = [
    "core",
    "storage",
    "dashboard",
    "assets",
    "passkeys",
    "self-update",
    "notify",
    "webapp",
    "push",
];

/// What one feature switches on besides itself, mirroring `[features]` in
/// the kit's own `Cargo.toml`. `testing` is a dev-dependency feature: a
/// project's tests get the harness, its binary does not get a dashboard
/// from it, so it resolves to nothing here.
fn implied(feature: &str) -> &'static [&'static str] {
    match feature {
        "dashboard" => &["core", "assets", "storage"],
        "assets" | "storage" => &["core"],
        "passkeys" | "webapp" => &["dashboard", "assets", "storage", "core"],
        "push" => &["webapp", "dashboard", "assets", "storage", "core"],
        "self-update" | "notify" => &["core"],
        _ => &[],
    }
}

/// The kit features a project's binary is built with (K35), resolved from
/// the `chassis` dependency in its `Cargo.toml`: what it lists, what those
/// imply, and `core` from the kit's default feature unless the project set
/// `default-features = false`.
///
/// `None` when the file names no `chassis` dependency at all — the caller
/// decides what a document should then say, since "no features" and "we
/// could not tell" are different answers (rule 30).
pub fn kit_features(cargo_toml: &str) -> Result<Option<Vec<String>>, Error> {
    let table = parse_cargo(cargo_toml)?;
    let Some(dep) = chassis_dep(&table) else {
        return Ok(None);
    };
    let mut on: Vec<&str> = Vec::new();
    match dep {
        // `chassis = "1.8.0"`: default features, nothing added.
        // The kit's default features: core and (since 3.11.0) storage.
        toml::Value::String(_) => on.extend(["core", "storage"]),
        toml::Value::Table(t) => {
            let defaults_on = t
                .get("default-features")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            if defaults_on {
                on.extend(["core", "storage"]);
            }
            if let Some(list) = t.get("features").and_then(|v| v.as_array()) {
                for f in list.iter().filter_map(|v| v.as_str()) {
                    if let Some(known) = KIT_FEATURES.iter().find(|k| **k == f) {
                        on.push(known);
                    }
                    on.extend(implied(f).iter().copied());
                }
            }
        }
        _ => return Ok(None),
    }
    Ok(Some(
        KIT_FEATURES
            .iter()
            .filter(|f| on.contains(*f))
            .map(|f| (*f).to_string())
            .collect(),
    ))
}

/// Rewrites every kit version on a `chassis` dependency line in a
/// `Cargo.toml` (feat-sync-1): `tag = "vX"` and `version = "X"`, on the
/// ordinary dependency and on the dev-dependency that carries the test
/// harness. Both lines name the kit, and a project that moves one and
/// forgets the other builds against two versions of it — which `chassis
/// sync` cannot report, because it only reads `[dependencies]`.
pub fn set_kit_dependency(cargo_toml: &str, tag: &str) -> String {
    let version = normalise(tag);
    let mut out = String::with_capacity(cargo_toml.len());
    for line in cargo_toml.split_inclusive('\n') {
        if line.trim_start().starts_with("chassis = ") && line.contains("tag = \"") {
            let mut rebuilt = String::with_capacity(line.len());
            let mut rest = line;
            while let Some(i) = rest.find("tag = \"") {
                let (before, after) = rest.split_at(i + "tag = \"".len());
                rebuilt.push_str(before);
                let end = after.find('"').unwrap_or(0);
                rebuilt.push_str(tag);
                rest = &after[end..];
            }
            rebuilt.push_str(rest);
            let mut second = String::with_capacity(rebuilt.len());
            let mut rest = rebuilt.as_str();
            while let Some(i) = rest.find("version = \"") {
                let (before, after) = rest.split_at(i + "version = \"".len());
                second.push_str(before);
                let end = after.find('"').unwrap_or(0);
                second.push_str(version);
                rest = &after[end..];
            }
            second.push_str(rest);
            out.push_str(&second);
        } else {
            out.push_str(line);
        }
    }
    out
}

/// Reads the `chassis` dependency out of a `Cargo.toml`.
pub fn kit_dependency(cargo_toml: &str) -> Result<KitDependency, Error> {
    let table = parse_cargo(cargo_toml)?;
    let dep = chassis_dep(&table);
    let string_of =
        |t: &toml::Table, key: &str| t.get(key).and_then(|v| v.as_str()).map(str::to_string);
    Ok(match dep {
        None => KitDependency::Missing,
        Some(toml::Value::String(version)) => KitDependency::Git {
            tag: None,
            version: Some(version.clone()),
        },
        Some(toml::Value::Table(t)) => match string_of(t, "path") {
            Some(path) => KitDependency::Path(path),
            None => KitDependency::Git {
                tag: string_of(t, "tag"),
                version: string_of(t, "version"),
            },
        },
        Some(other) => {
            return Err(Error::config(
                format!(
                    "the chassis dependency in Cargo.toml is a {}, not a table",
                    other.type_str()
                ),
                "write it as `chassis = { git = \"…\", tag = \"vX.Y.Z\", version = \"X.Y.Z\", features = [...] }` (see the scaffold's Cargo.toml)",
            ));
        }
    })
}

/// `v1.7.1`, `1.7.1`, `^1.7.1` and `=1.7.1` all name the same release.
pub(super) fn normalise(version: &str) -> &str {
    version.trim().trim_start_matches(['v', '^', '=']).trim()
}

/// Compares `Cargo.toml`'s kit dependency with `.chassis.toml`'s `chassis_tag`.
/// A path dependency yields nothing: the caller reports it as a note.
pub fn kit_tag_drift(dep: &KitDependency, chassis_tag: &str) -> Vec<Drift> {
    let expected = normalise(chassis_tag);
    let says = format!(".chassis.toml says {chassis_tag}");
    match dep {
        KitDependency::Path(_) => Vec::new(),
        KitDependency::Missing => vec![Drift::new(
            "kit dependency",
            "Cargo.toml has no chassis dependency".into(),
            says,
            "add `chassis = { git = \"<chassis_repo>\", tag = \"<chassis_tag>\", version = \"<X.Y.Z>\", features = [...] }` under [dependencies] (the scaffold's Cargo.toml shows the line)".into(),
        )],
        KitDependency::Git { tag, version } => {
            let mut out = Vec::new();
            match tag {
                None => out.push(Drift::new(
                    "kit tag",
                    "Cargo.toml pins no tag".into(),
                    says.clone(),
                    format!(
                        "add `tag = \"{chassis_tag}\"` to the chassis dependency (the kit is a git dependency, not a crates.io one), then cargo update -p chassis"
                    ),
                )),
                Some(tag) if normalise(tag) != expected => out.push(Drift::new(
                    "kit tag",
                    format!("Cargo.toml pins {tag}"),
                    says.clone(),
                    "bump the tag in Cargo.toml or chassis_tag in .chassis.toml so they agree, then cargo update -p chassis".into(),
                )),
                Some(_) => {}
            }
            if let Some(version) = version
                && normalise(version) != expected
            {
                out.push(Drift::new(
                    "kit version",
                    format!("Cargo.toml requires version {version}"),
                    says,
                    format!(
                        "set `version = \"{expected}\"` next to the tag (cargo-deny refuses a git dependency without one), then cargo update -p chassis"
                    ),
                ));
            }
            out
        }
    }
}

#[cfg(test)]
mod tests;
