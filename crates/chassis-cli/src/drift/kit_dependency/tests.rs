//! The kit tag and feature comparisons, over strings only.

use super::*;

/// K35: what a project lists is what its documentation describes, plus
/// what the kit's own `[features]` pulls in behind it. Drilled red by
/// dropping the `implied` expansion: `passkeys` alone then reported no
/// dashboard, and a dashboard section would have vanished from a
/// project that has one.
#[test]
fn k35_features_resolve_what_the_project_lists_and_what_it_implies() {
    let dep = |line: &str| format!("[dependencies]\n{line}\n");
    let features = |line: &str| kit_features(&dep(line)).unwrap().unwrap();

    assert_eq!(
        features(r#"chassis = { git = "g", tag = "v1", features = ["dashboard", "self-update"] }"#),
        ["core", "storage", "dashboard", "assets", "self-update"],
    );
    assert_eq!(
        features(r#"chassis = { git = "g", tag = "v1", features = ["passkeys"] }"#),
        ["core", "storage", "dashboard", "assets", "passkeys"],
        "passkeys brings the dashboard it lives on"
    );
    assert_eq!(
        features(
            r#"chassis = { git = "g", tag = "v1", default-features = false, features = ["core", "self-update"] }"#
        ),
        ["core", "self-update"],
        "the headless shape: kyu-runner and http-switchboard"
    );
    assert_eq!(
        features(r#"chassis = "1.8.0""#),
        ["core", "storage"],
        "a bare version string is the kit's default feature"
    );
}

/// K35: no dependency to read is not the same answer as no features
/// (rule 30), so the caller gets `None` rather than an empty list.
#[test]
fn k35_a_cargo_toml_without_the_kit_reports_that_it_could_not_tell() {
    let none = kit_features("[dependencies]\nserde = \"1\"\n").unwrap();
    assert_eq!(none, None);
}

const GIT_DEP: &str = r#"
[package]
name = "demo"
version = "0.1.0"

[dependencies]
# the kit
chassis = { git = "https://github.com/kennypassenier/chassis-rs", tag = "v1.7.1", version = "1.7.1", features = ["dashboard"] }
axum = "0.8"
"#;

// Drilled red once (expected a drift line for the matching tag): failed, restored.
#[test]
fn k32_matching_kit_tag_is_no_drift() {
    let dep = kit_dependency(GIT_DEP).unwrap();
    assert_eq!(
        dep,
        KitDependency::Git {
            tag: Some("v1.7.1".into()),
            version: Some("1.7.1".into()),
        }
    );
    assert!(kit_tag_drift(&dep, "v1.7.1").is_empty());
    assert!(
        kit_tag_drift(&dep, "1.7.1").is_empty(),
        "vX.Y.Z and X.Y.Z name the same tag"
    );
}

// Drilled red once (flipped the expected line count to 0): failed, restored.
#[test]
fn k32_kit_tag_mismatch_is_one_line_with_the_remedy() {
    // Almanac, 2026-09-06: Cargo.toml still on 1.7.0, .chassis.toml on 1.7.1.
    let dep = kit_dependency(&GIT_DEP.replace("1.7.1", "1.7.0")).unwrap();
    let drift = kit_tag_drift(&dep, "v1.7.1");
    assert_eq!(drift.len(), 2, "tag and version both lag: {drift:?}");
    assert_eq!(
        drift[0].to_string(),
        "! kit tag: Cargo.toml pins v1.7.0 vs .chassis.toml says v1.7.1 — bump the tag in Cargo.toml or chassis_tag in .chassis.toml so they agree, then cargo update -p chassis"
    );
    assert!(drift[1].to_string().starts_with("! kit version: Cargo.toml requires version 1.7.0 vs .chassis.toml says v1.7.1 — set `version = \"1.7.1\"`"));
    // Only the tag lags: one line.
    let dep = kit_dependency(&GIT_DEP.replace("tag = \"v1.7.1\"", "tag = \"v1.7.0\"")).unwrap();
    assert_eq!(kit_tag_drift(&dep, "v1.7.1").len(), 1);
    // No tag at all (a crates.io-style line) is drift too: the kit is git-only.
    let dep = kit_dependency("[dependencies]\nchassis = \"1.7.1\"\n").unwrap();
    let drift = kit_tag_drift(&dep, "v1.7.1");
    assert_eq!(drift.len(), 1);
    assert!(drift[0].to_string().contains("pins no tag"), "{}", drift[0]);
    assert_eq!(
        kit_tag_drift(&KitDependency::Missing, "v1.7.1").len(),
        1,
        "a project without the kit is reported, not skipped"
    );
}

// Drilled red once (asserted one drift line for the path dependency): failed, restored.
#[test]
fn k32_a_path_dependency_is_informative_not_drift() {
    let cargo = "[dependencies]\nchassis = { path = \"/home/kenny/Projects/chassis-rs/crates/chassis\", version = \"1.7.1\", features = [\"dashboard\"] }\n";
    let dep = kit_dependency(cargo).unwrap();
    assert_eq!(
        dep,
        KitDependency::Path("/home/kenny/Projects/chassis-rs/crates/chassis".into())
    );
    assert!(
        kit_tag_drift(&dep, "v0.0.0-test").is_empty(),
        "a drill's path dependency has no tag to compare"
    );
    assert!(
        kit_dependency("this is not toml [").is_err(),
        "a broken Cargo.toml is an error with a remedy, not silence"
    );
}
