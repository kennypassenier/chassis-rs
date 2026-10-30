//! Tests of the release pieces: durations, the build invocations, the release
//! arguments, the notes and the `[release]` table.

use std::path::Path;

use super::build::has_dynamic_links;
use super::build_args::{glibc_build_args, glibc_image, musl_build_args_for};
use super::publish::release_notes;
use super::*;
use crate::recorded::Recorded;

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

fn glibc_rec() -> Recorded {
    let mut r = rec();
    r.release = toml::from_str(
        "binaries = [\"host\", \"client\"]\nbuild = \"glibc\"\nsign = false\nnotes = \"generated\"",
    )
    .unwrap();
    r
}

/// homelab-shared-4: several binaries are built with one `--bin` each,
/// and a project that names none gets the command it always had.
#[test]
fn named_binaries_add_bin_flags_and_none_changes_nothing() {
    let none = musl_build_args_for(Path::new("/p"), "1.97", 1, 1, &[]);
    assert!(
        none.last()
            .unwrap()
            .contains("--target x86_64-unknown-linux-musl; status"),
        "no --bin when none are named: {}",
        none.last().unwrap()
    );
    let two = musl_build_args_for(Path::new("/p"), "1.97", 1, 1, &["a".into(), "b".into()]);
    assert!(
        two.last()
            .unwrap()
            .contains("--target x86_64-unknown-linux-musl --bin a --bin b; status"),
        "{}",
        two.last().unwrap()
    );
}

/// The glibc build is a Debian image with plain `cargo build`, writing
/// to its own directory; the default image is the older Debian.
#[test]
fn the_glibc_build_is_a_debian_image_without_the_musl_target() {
    let r = glibc_rec();
    assert_eq!(glibc_image(&r), "rust:1.97-slim-bookworm");
    let args = glibc_build_args(
        Path::new("/p/demo-svc"),
        &glibc_image(&r),
        1000,
        1000,
        &r.release.binaries,
    );
    let joined = args.join(" ");
    assert!(
        joined.starts_with(
            "run --rm -v /p/demo-svc:/w -w /w -e CARGO_TARGET_DIR=/w/target-glibc -e CARGO_HOME=/w/target-glibc/cargo-home rust:1.97-slim-bookworm sh -c "
        ),
        "{joined}"
    );
    let script = args.last().unwrap();
    assert!(
        script.starts_with("cargo build --release --locked --bin host --bin client;"),
        "{script}"
    );
    assert!(
        !script.contains("musl") && !script.contains("apt-get"),
        "{script}"
    );
    assert!(
        script.ends_with("chown -R 1000:1000 /w/target-glibc; exit $status"),
        "{script}"
    );
    let mut custom = glibc_rec();
    custom.release.glibc_image = Some("rust:1.97-slim-trixie".into());
    assert_eq!(glibc_image(&custom), "rust:1.97-slim-trixie");
}

/// Every binary is a release asset next to the manifest; generated
/// notes replace the notes file; the default stays exactly as it was.
#[test]
fn a_multi_binary_release_uploads_every_binary_and_can_take_generated_notes() {
    assert_eq!(
        release_create_args(&glibc_rec(), "v1.2.3").join(" "),
        "release create v1.2.3 --repo kennypassenier/demo-svc --verify-tag --title v1.2.3 \
         --generate-notes --latest=false dist/host dist/client dist/SHA256SUMS"
    );
    let mut local = glibc_rec();
    local.release.notes = crate::release_config::Notes::Local;
    let joined = release_create_args(&local, "v1.2.3").join(" ");
    assert!(
        joined.contains("--notes-file target-glibc/release-notes.md"),
        "{joined}"
    );
    assert!(build_plan_line(&glibc_rec()).contains("dist/host + dist/client"));
    assert!(build_plan_line(&rec()).contains("refuse any `=>` in ldd"));
}

/// The glibc build is dynamically linked on purpose: no ldd refusal,
/// and the notes say so.
#[test]
fn the_glibc_notes_say_dynamic_and_generated_notes_write_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let mut r = glibc_rec();
    write_notes(dir.path(), &r, "abc1234").unwrap();
    assert!(
        !dir.path().join("target-glibc").exists(),
        "generated: nothing written"
    );
    r.release.notes = crate::release_config::Notes::Local;
    write_notes(dir.path(), &r, "abc1234").unwrap();
    let body = std::fs::read_to_string(dir.path().join("target-glibc/release-notes.md")).unwrap();
    assert!(
        body.contains("glibc") && body.contains("dynamically linked"),
        "{body}"
    );
    assert_eq!(linkage_label(&r), "glibc, dynamically linked");
    assert_eq!(linkage_label(&rec()), "static, no dynamic links");
}

/// The record without a `[release]` table is unchanged, and one with it
/// survives a write and a read.
#[test]
fn the_release_table_round_trips_and_is_absent_by_default() {
    let plain = toml::to_string_pretty(&rec()).unwrap();
    assert!(
        !plain.contains("release"),
        "default is not written: {plain}"
    );
    let text = toml::to_string_pretty(&glibc_rec()).unwrap();
    assert!(text.contains("[release]"), "{text}");
    let back: Recorded = toml::from_str(&text).unwrap();
    assert_eq!(back.release, glibc_rec().release);
}
