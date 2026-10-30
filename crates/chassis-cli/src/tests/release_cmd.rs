//! `chassis release`: the changelog heading, the migration note a major needs, the
//! files a release requires, the plan it prints and whether it builds an image.

use super::rec;
use crate::manifest_version::{bump_version, current_version};
use crate::new_validation::validate_name;
use crate::release;
use crate::release_changelog::chrono_free_today;
use crate::release_changelog::{check_major_has_migration, release_changelog};
use crate::release_plan::release_plan;
use crate::release_preflight::check_release_files;

#[test]
fn names_versions_and_changelog() {
    assert!(validate_name("inbox").is_ok());
    assert!(validate_name("Inbox").is_err());
    assert!(validate_name("1st").is_err());
    assert!(validate_name("a_b").is_err());
    let bumped = bump_version(
        "[package]\nname = \"x\"\nversion = \"0.1.0\"\n\n[dependencies]\nversion = \"9\"\n",
        "0.2.0",
    )
    .unwrap();
    assert!(bumped.contains("version = \"0.2.0\"") && bumped.contains("version = \"9\""));
    let cl = release_changelog(
        "# Changelog\n\n## [Unreleased]\n\n### Added\n- x\n",
        "0.2.0",
        "2026-09-05",
    );
    assert!(cl.contains("## [Unreleased]\n\n## [0.2.0] - 2026-09-05"));
    assert_eq!(chrono_free_today().len(), 10);
}

#[test]
fn major_bumps_need_a_migration_note() {
    let v = |s: &str| chassis::core::update::Version::parse(s).unwrap();
    assert_eq!(
        current_version("[package]\nversion = \"1.2.3\"\n").unwrap(),
        v("1.2.3")
    );
    assert!(check_major_has_migration("## [Unreleased]\n- x\n", v("1.2.3"), v("1.3.0")).is_ok());
    assert!(
        check_major_has_migration("## [Unreleased]\n- x\n", v("1.2.3"), v("2.0.0")).is_err(),
        "major without Migration is refused"
    );
    assert!(
        check_major_has_migration(
            "## [Unreleased]\n### Migration\n- rename X\n",
            v("1.2.3"),
            v("2.0.0")
        )
        .is_ok()
    );
}

/// CF-6: a release that builds an image refuses a missing Dockerfile
/// before the gate runs; 3.3.0: one without an image does not need it.
/// 3.0.0: no CI workflow is required any more.
#[test]
fn a_release_needs_a_dockerfile_and_the_sign_script_but_no_workflow() {
    let dir = tempfile::tempdir().unwrap();
    let err = check_release_files(dir.path(), true, true).unwrap_err();
    assert!(err.to_string().contains("no Dockerfile"), "{err}");
    let err = check_release_files(dir.path(), false, true).unwrap_err();
    assert!(
        err.to_string().contains("sign-release.sh"),
        "without an image only the sign script is asked for: {err}"
    );
    std::fs::write(dir.path().join("Dockerfile"), "FROM scratch\n").unwrap();
    let err = check_release_files(dir.path(), true, true).unwrap_err();
    assert!(err.to_string().contains("sign-release.sh"), "{err}");
    std::fs::create_dir_all(dir.path().join("scripts")).unwrap();
    std::fs::write(dir.path().join("scripts/sign-release.sh"), "").unwrap();
    check_release_files(dir.path(), true, true).unwrap();
    assert!(!dir.path().join(".github").exists());
}

/// homelab-shared-4: `[release] sign = false` leaves signing to the
/// owner, so the sign script is not required; the default still is.
#[test]
fn a_project_that_signs_outside_the_tool_needs_no_sign_script() {
    let dir = tempfile::tempdir().unwrap();
    check_release_files(dir.path(), false, false).unwrap();
    assert!(check_release_files(dir.path(), false, true).is_err());
}

/// homelab-shared-4: the plan names the hooks where they run, the
/// annotated tag, every binary, and the missing signing step.
#[test]
fn the_plan_names_hooks_binaries_and_a_missing_signing_step() {
    let mut r = rec();
    let default_plan = release_plan(&r, "1.2.3", "v1.2.3", false);
    assert!(
        !default_plan.iter().any(|l| l.starts_with("hooks ")),
        "{default_plan:?}"
    );
    assert!(default_plan.iter().any(|l| l.contains("sign-release.sh")));
    r.release = toml::from_str(
        "binaries = [\"a\", \"b\"]\nsign = false\n[hooks]\npre_gate = [\"scripts/x\"]\npost_gate = [\"scripts/y\"]\ntag_notes = \"scripts/z\"",
    )
    .unwrap();
    let plan = release_plan(&r, "1.2.3", "v1.2.3", false);
    assert!(
        plan[0].starts_with("hooks before the gate: scripts/x"),
        "{plan:?}"
    );
    assert!(plan[0].contains("tag_notes scripts/z"), "{plan:?}");
    assert!(
        plan[3].starts_with("hooks after the gate: scripts/y"),
        "{plan:?}"
    );
    assert!(
        plan.iter().any(|l| l.contains("dist/a + dist/b")),
        "{plan:?}"
    );
    assert!(
        !plan.iter().any(|l| l.contains("sign-release.sh")),
        "{plan:?}"
    );
}

/// 3.3.0 (Kenny, 2026-10-02): a project the homelab runs as a native
/// unit ships no image; `.chassis.toml` decides when it says so.
#[test]
fn the_image_follows_the_deployment_unless_the_project_says_otherwise() {
    let dir = tempfile::tempdir().unwrap();
    let mut r = rec();
    assert!(
        release::wants_image(dir.path(), &r).0,
        "no stack file: an image, as before"
    );
    std::fs::create_dir_all(dir.path().join("deploy")).unwrap();
    std::fs::write(
        dir.path().join("deploy/service.yml"),
        "stack_name: demo\nbinary: /opt/demo/bin/demo\n",
    )
    .unwrap();
    assert!(
        !release::wants_image(dir.path(), &r).0,
        "a native stack: no image"
    );
    r.image = Some(true);
    assert!(release::wants_image(dir.path(), &r).0, ".chassis.toml wins");
    r.image = Some(false);
    std::fs::remove_file(dir.path().join("deploy/service.yml")).unwrap();
    assert!(
        !release::wants_image(dir.path(), &r).0,
        ".chassis.toml wins"
    );
    let plan = release_plan(&r, "1.2.3", "v1.2.3", false);
    assert!(
        plan.iter()
            .all(|s| !s.starts_with("docker build -t ") && !s.starts_with("docker push ")),
        "{plan:#?}"
    );
    assert!(
        release_plan(&r, "1.2.3", "v1.2.3", true)
            .iter()
            .any(|s| s.starts_with("docker push ")),
    );
}
