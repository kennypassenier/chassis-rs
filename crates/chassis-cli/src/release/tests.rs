//! Tests of the release pieces: durations, the build invocations, the release
//! arguments, the notes and the `[release]` table.

use std::path::Path;

use super::build::has_dynamic_links;
use super::build_args::{glibc_build_args, glibc_image, musl_build_args_for};
use super::publish::release_notes;
use super::*;
use crate::recorded::Recorded;

mod glibc;

/// Kenny, 2026-10-02: every test run reports its measured duration; the
/// gate prints it in minutes and seconds, never bare seconds past 60.
#[test]
fn the_gate_reports_durations_in_minutes_and_seconds() {
    use std::time::Duration;
    assert_eq!(took(Duration::from_secs(48)), "48 s");
    assert_eq!(took(Duration::from_secs(100)), "1 min 40 s");
    assert_eq!(took(Duration::from_millis(186_900)), "3 min 6 s");
    let steps = include_str!("test_step.rs");
    assert!(steps.contains("\"chassis release: tests took {} (measured)\""));
    // Kenny, 2026-10-04: the suites run side by side when nextest is there.
    assert!(steps.contains("[\"nextest\", \"run\", \"--no-fail-fast\"]"));
    // The gate ends in one place now (every path through it reaches the same
    // closing line), so one occurrence covers the image and the native flow.
    assert_eq!(
        include_str!("gate.rs")
            .matches("\"chassis release: gate green, took {} (measured)\"")
            .count(),
        1,
        "the gate says how long it took"
    );
}

fn rec() -> Recorded {
    Recorded {
        name: "demo-svc".into(),
        description: "A demo".into(),
        repo: "kennypassenier/demo-svc".into(),
        toolchain: "1.97".into(),
        chassis_tag: "v0.1.0".into(),
        chassis_repo: crate::recorded::CHASSIS_REPO.into(),
        chassis_path: None,
        kp_themes: crate::recorded::KP_THEMES.into(),
        state_dir: "/var/lib/demo-svc".into(),
        latch: false,
        env_file: None,
        latch_env: None,
        deny_ignore: Vec::new(),
        unit_service: Vec::new(),
        image: None,
        required_checks: Vec::new(),
        vmid: 0,
        release: Default::default(),
    }
}

/// The musl build is release.yml's docker invocation: same image, same
/// mounts and variables, same apt line, same cargo command.
#[test]
fn the_musl_build_is_the_workflows_docker_invocation() {
    let args = musl_build_args_for(Path::new("/p/demo-svc"), "1.97", 1000, 1000, &[]);
    let joined = args.join(" ");
    assert!(
        joined.starts_with(
            "run --rm -v /p/demo-svc:/w -w /w -e CARGO_TARGET_DIR=/w/target-musl -e CARGO_HOME=/w/target-musl/cargo-home rust:1.97-slim-trixie sh -c "
        ),
        "{joined}"
    );
    let script = args.last().unwrap();
    assert!(
        script.contains("apt-get install -y -qq musl-tools"),
        "{script}"
    );
    assert!(
        script.contains("cargo build --release --locked --target x86_64-unknown-linux-musl"),
        "{script}"
    );
    // The build's own status decides, and the files end up the user's.
    assert!(
        script.ends_with("status=$?; chown -R 1000:1000 /w/target-musl; exit $status"),
        "{script}"
    );
}

/// Drilled red once (the verdict always `false`): failed, restored.
#[test]
fn ldd_refuses_a_resolved_library_only() {
    assert!(!has_dynamic_links("\tnot a dynamic executable\n"));
    assert!(!has_dynamic_links("\tstatically linked\n"));
    assert!(has_dynamic_links(
        "\tlinux-vdso.so.1 (0x00007ffd)\n\tlibc.so.6 => /usr/lib/libc.so.6 (0x00007f)\n"
    ));
}

#[test]
fn the_tag_must_name_the_cargo_version() {
    assert!(check_tag_matches("v1.2.3", "1.2.3").is_ok());
    let err = check_tag_matches("v1.2.4", "1.2.3")
        .unwrap_err()
        .to_string();
    assert!(
        err.contains("tag v1.2.4 but Cargo.toml says 1.2.3"),
        "{err}"
    );
}

/// fix-10 survives the move: the release is created without `latest`,
/// with the workflow's asset names, title and body.
#[test]
fn the_release_is_created_like_the_workflow_did_but_never_latest() {
    let joined = release_create_args(&rec(), "v1.2.3").join(" ");
    assert_eq!(
        joined,
        "release create v1.2.3 --repo kennypassenier/demo-svc --verify-tag --title v1.2.3 \
         --notes-file target-musl/release-notes.md --latest=false dist/demo-svc dist/SHA256SUMS"
    );
    let notes = release_notes("abc1234");
    assert!(notes.starts_with("Built locally from `abc1234`"), "{notes}");
    assert!(notes.contains("statically linked (x86_64-unknown-linux-musl)"));
    assert_eq!(
        image_tags("kennypassenier/demo-svc", "v1.2.3"),
        [
            "ghcr.io/kennypassenier/demo-svc:v1.2.3".to_string(),
            "ghcr.io/kennypassenier/demo-svc:latest".to_string()
        ]
    );
}
