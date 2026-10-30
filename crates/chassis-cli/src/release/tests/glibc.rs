//! Tests of the glibc (Debian) release variant, multi-binary releases and
//! the `[release]` table round trip. Split from `tests` by scenario.

use super::*;

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
