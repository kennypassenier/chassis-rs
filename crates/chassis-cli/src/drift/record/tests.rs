//! The record comparisons: kp-themes, the retired workflows and `required_checks`.

use super::*;

// Drilled red once (compared against "3.0.0" instead of the manifest): failed, restored.
#[test]
fn k32_vendored_kp_themes_comes_from_the_manifest_header() {
    let v = vendored_kp_themes();
    assert!(
        KP_THEMES_MANIFEST.starts_with(&format!("# @kp-soft/themes v{v} ")),
        "{v} is the header's version"
    );
    assert!(
        v.split('.').count() == 3 && v.split('.').all(|p| p.parse::<u32>().is_ok()),
        "{v} is X.Y.Z"
    );
    assert!(kp_themes_drift(v, v).is_none());
}

// Drilled red once (expected None for the mismatch): failed, restored.
#[test]
fn k32_kp_themes_mismatch_is_one_line_and_write_fixes_the_file_keeping_comments() {
    let drift = kp_themes_drift("3.0.0", "3.1.0").expect("a mismatch");
    assert_eq!(
        drift.to_string(),
        "! kp_themes: .chassis.toml records 3.0.0 vs the kit at this version vendors kp-themes 3.1.0 — update kp_themes in .chassis.toml (`chassis sync --write` does it; the kit is the source of truth here)"
    );
    let before = "# Written by `chassis new`; read by `chassis sync` and `chassis release`.\nname = \"almanac\"\n# measured on CT 112\nkp_themes = \"3.0.0\" # bumped by hand\nstate_dir = \"/var/lib/almanac\"\n";
    let after = set_kp_themes(before, "3.1.0").unwrap();
    assert_eq!(
        after,
        "# Written by `chassis new`; read by `chassis sync` and `chassis release`.\nname = \"almanac\"\n# measured on CT 112\nkp_themes = \"3.1.0\" # bumped by hand\nstate_dir = \"/var/lib/almanac\"\n"
    );
    let parsed: toml::Table = after.parse().unwrap();
    assert_eq!(parsed["kp_themes"].as_str(), Some("3.1.0"));
    // Without a trailing comment the line is just the value.
    assert_eq!(
        set_kp_themes("kp_themes = \"3.0.0\"\nlatch = false\n", "3.1.0").unwrap(),
        "kp_themes = \"3.1.0\"\nlatch = false\n"
    );
    let err = set_kp_themes("name = \"x\"\n", "3.1.0").unwrap_err();
    assert!(err.to_string().contains("no kp_themes line"), "{err}");
    // The atomic write leaves no temp file behind and the content is what was given.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(".chassis.toml");
    std::fs::write(&path, before).unwrap();
    write_atomically(&path, &after).unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap(), after);
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
}

/// 3.0.0: the two workflows are reported until `sync --write` removes them.
#[test]
fn the_workflows_are_obsolete_and_say_what_replaced_them() {
    let paths: Vec<&str> = OBSOLETE_FILES.iter().map(|o| o.path).collect();
    assert_eq!(
        paths,
        [".github/workflows/ci.yml", ".github/workflows/release.yml"]
    );
    let line = OBSOLETE_FILES[1].drift().to_string();
    assert!(
        line.starts_with("! obsolete file: .github/workflows/release.yml is still here vs not shipped by the kit since 3.0.0"),
        "{line}"
    );
    assert!(
        line.ends_with("— `chassis sync --write` removes it"),
        "{line}"
    );
}

#[test]
fn a_recorded_required_checks_list_is_drift() {
    assert!(required_checks_drift(&[]).is_none());
    let d = required_checks_drift(&["fmt · clippy · tests".to_string()]).unwrap();
    assert_eq!(d.project, "lists fmt · clippy · tests");
    assert!(d.remedy.starts_with("delete the line"), "{d}");
}
