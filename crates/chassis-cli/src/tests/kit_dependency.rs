//! How the kit shows up in a project's Cargo.toml: moved by `upgrade`, pinned next
//! to its tag, or replaced by a path dependency.

use super::rec;
use crate::drift;
use crate::recorded::{Recorded, scaffold_features};
use crate::render::{render_all, with_chassis_path};

/// feat-sync-1: the kit version lives in three places and one command
/// moves all three. Drilled red by rewriting only the first `tag = "…"`
/// of a line: the dev-dependency kept the old tag and the count check
/// reported "1 of 2 chassis dependency lines".
#[test]
fn feat_sync_1_upgrade_moves_every_line_that_names_the_kit() {
    let cargo = r#"[dependencies]
chassis = { git = "g", tag = "v1.8.0", version = "1.8.0", features = ["dashboard"] }
serde = "1"

[dev-dependencies]
chassis = { git = "g", tag = "v1.8.0", version = "1.8.0", features = ["testing"] }
"#;
    let moved = drift::set_kit_dependency(cargo, "v1.9.0");
    assert_eq!(
        moved.matches("tag = \"v1.9.0\"").count(),
        2,
        "both lines move, the dependency and the dev-dependency:\n{moved}"
    );
    assert_eq!(
        moved.matches("version = \"1.9.0\"").count(),
        2,
        "and so does the version requirement beside each tag:\n{moved}"
    );
    assert!(
        moved.contains("serde = \"1\""),
        "nothing else in the file is touched:\n{moved}"
    );
    assert!(
        moved.contains("features = [\"testing\"]"),
        "the feature lists survive:\n{moved}"
    );

    let record = "name = \"demo\"\nchassis_tag = \"v1.8.0\" # the kit\nkp_themes = \"5.0.0\"\n";
    let rewritten = drift::set_chassis_tag(record, "v1.9.0").unwrap();
    assert!(
        rewritten.contains("chassis_tag = \"v1.9.0\" # the kit"),
        "the record moves and keeps its note: {rewritten}"
    );
    assert!(
        rewritten.contains("kp_themes = \"5.0.0\""),
        "and the other lines stay: {rewritten}"
    );
}

#[test]
fn the_git_dependency_pins_a_version_next_to_its_tag() {
    // cargo-deny's `wildcards = "deny"` flags a git dependency without a
    // version requirement; the first remote `chassis new` was red on it
    // (2026-09-06), as kyu-runner's migration had already found by hand.
    let cargo = render_all(&rec(), &scaffold_features())
        .unwrap()
        .into_iter()
        .find(|(p, ..)| p == "Cargo.toml")
        .unwrap()
        .1;
    assert!(
        cargo.contains("tag = \"v0.1.0\", version = \"0.1.0\", features = ["),
        "{cargo}"
    );
}

/// K34 moved this test to one `Recorded`: the scaffold now names the kit
/// twice (the dependency and the dev-dependency on its test harness), and
/// `with_chassis_path` only rewrites the first line. Rendering with the
/// same record `cmd_new` renders with is what the real flow does — the
/// template turns the dev-dependency into a path dependency itself — and
/// it is what makes "no git dependency is left" true again.
#[test]
fn chassis_path_replaces_the_git_dependency() {
    let local_rec = Recorded {
        chassis_path: Some("/tmp/kit".into()),
        ..rec()
    };
    let cargo = render_all(&local_rec, &scaffold_features())
        .unwrap()
        .into_iter()
        .find(|(p, ..)| p == "Cargo.toml")
        .unwrap()
        .1;
    let local = with_chassis_path(&cargo, &local_rec);
    assert!(
        local.contains(&format!(
            "chassis = {{ path = \"/tmp/kit\", version = \"{}\", features = [",
            env!("CARGO_PKG_VERSION")
        )),
        "{local}"
    );
    assert!(!local.contains("git ="));
}
