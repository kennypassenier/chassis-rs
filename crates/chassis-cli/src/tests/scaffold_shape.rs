//! What the rendered scaffold looks like: the latch unit, every template, and the
//! musl/distroless build shape that four files have to agree on.

use super::rec;
use crate::new_validation::{validate_description, validate_repo};
use crate::recorded::{KP_THEMES, RELEASE_PUBKEY, Recorded, TOOLCHAIN, scaffold_features};
use crate::render::render_all;
use crate::{drift, release, templates};
use std::path::Path;

/// M2 / critic #4: the latch variant of the unit lets the child's READY
/// through and runs --check under latch's secrets, and the binary lives
/// in its own directory (S2).
#[test]
fn latch_unit_has_notify_access_all_and_checks_under_latch() {
    let mut r = rec();
    r.latch = true;
    let files = render_all(&r, &scaffold_features()).unwrap();
    let unit = files
        .iter()
        .find(|(p, ..)| p == "deploy/demo-svc-latch.service")
        .map(|(_, b, ..)| b.clone())
        .expect("latch unit rendered");
    assert!(unit.contains("NotifyAccess=all"), "{unit}");
    assert!(
        unit.contains(
            "ExecStartPre=/usr/local/bin/latch run --env prod -- /opt/demo-svc/bin/demo-svc --check"
        ),
        "{unit}"
    );
    assert!(
        unit.contains(
            "ReadWritePaths=/var/lib/demo-svc /var/lib/demo-svc-pre-update /opt/demo-svc/bin"
        ),
        "{unit}"
    );
    assert!(
        !unit.contains("/usr/local/bin/demo-svc"),
        "the service never lives in the shared bin dir (S2)"
    );
    assert!(validate_repo("kennypassenier/inbox").is_ok());
    assert!(validate_repo("no-slash").is_err());
    assert!(validate_repo("a/b; rm -rf").is_err());
    assert!(validate_description("A service built on chassis").is_ok());
    assert!(validate_description("two\nlines").is_err());
    assert!(validate_description("has \"quotes\"").is_err());
}

#[test]
fn every_template_renders_and_substitutes() {
    let files = render_all(&rec(), &scaffold_features()).unwrap();
    let expected = templates::ENTRIES
        .iter()
        .filter(|e| !e.path.contains("latch"))
        .count();
    assert_eq!(
        files.len(),
        expected,
        "every non-latch entry renders exactly once"
    );
    let get = |p: &str| {
        files
            .iter()
            .find(|(path, ..)| path == p)
            .map(|(_, b, ..)| b.clone())
            .unwrap_or_else(|| panic!("{p} missing"))
    };
    assert!(get("Cargo.toml").contains("name = \"demo-svc\""));
    assert!(get("Cargo.toml").contains("tag = \"v0.1.0\""));
    assert!(
        get("deploy/demo-svc.service").contains("ExecStartPre=/opt/demo-svc/bin/demo-svc --check")
    );
    assert!(
        get("deploy/demo-svc.service").contains("StartLimitIntervalSec=0"),
        "in [Unit]"
    );
    // fix-12: the install line sets the owner itself. A separate
    // `chown -R` step left kyu's binary root-owned on CT 109, and the
    // self-update cannot hard-link a file its user does not own.
    let unit = get("deploy/demo-svc.service");
    assert!(
        unit.contains(
            "install -D -m755 -o demo-svc -g demo-svc demo-svc /opt/demo-svc/bin/demo-svc"
        ),
        "{unit}"
    );
    assert!(
        !unit.contains("chown -R"),
        "ownership is set by install, not after it"
    );
    assert!(
        get("deploy/service.yml").contains("update_cmd:")
            && get("deploy/service.yml").contains("--wait --pipe --collect")
    );
    assert!(get("Dockerfile").contains("DEMO_SVC_LISTEN"));
    assert!(get("scripts/sign-release.sh").contains(RELEASE_PUBKEY));
    // fix-10: `latest` names a signed release only. `chassis release`
    // creates the release without taking `latest` (release.rs); signing
    // takes it after VERSION is up.
    let sign = get("scripts/sign-release.sh");
    let version_up = sign
        .find("--clobber \"$work/VERSION\"")
        .expect("VERSION upload");
    let latest = sign
        .find("--latest")
        .expect("sign-release.sh marks the release latest");
    assert!(latest > version_up, "latest only after VERSION is uploaded");
    // K27: the generated kit documentation renders with the project's
    // names and the kit's version.
    let kit_md = get("docs/KIT.md");
    assert!(
        kit_md.contains("# What demo-svc gets from chassis"),
        "{kit_md}"
    );
    assert!(kit_md.contains("chassis 0.1.0") && kit_md.contains("`v0.1.0`"));
    assert!(kit_md.contains("DEMO_SVC_TOKEN"), "{kit_md}");
    assert!(
        !files.iter().any(|(p, ..)| p.contains("latch")),
        "latch unit only on request"
    );
    let files = render_all(
        &Recorded {
            latch: true,
            ..rec()
        },
        &scaffold_features(),
    )
    .unwrap();
    assert!(
        files
            .iter()
            .any(|(p, ..)| p == "deploy/demo-svc-latch.service")
    );
}

/// K32: the version `new` records is the one the kit's static files
/// are, so `.chassis.toml` cannot start life with a claim nothing checks.
// Drilled red once (compared the constant with "3.0.0"): failed, restored.
#[test]
fn k32_kp_themes_constant_equals_the_vendored_manifest() {
    assert_eq!(KP_THEMES, drift::vendored_kp_themes());
}

/// 3.0.0 (Kenny, 2026-09-29): the scaffold ships no GitHub Actions
/// workflow; the gate and the release build run in `chassis release`.
/// A file the scaffold renders again would be written back by every
/// `sync --write` right after `OBSOLETE_FILES` removed it.
#[test]
fn the_scaffold_ships_no_workflow_and_sync_names_the_old_ones() {
    let files = render_all(&rec(), &scaffold_features()).unwrap();
    assert!(
        !files.iter().any(|(p, ..)| p.starts_with(".github/")),
        "no workflow in the scaffold: {:?}",
        files.iter().map(|(p, ..)| p).collect::<Vec<_>>()
    );
    for o in drift::OBSOLETE_FILES {
        assert!(
            !templates::ENTRIES.iter().any(|e| e.path == o.path),
            "{} is both shipped and obsolete",
            o.path
        );
    }
}

/// feat-build-1: one build shape for everyone — a statically linked
/// musl binary on distroless/static. Every release binary the scaffold
/// produced before needed GLIBC_2.39 and would not start on Debian 12,
/// which blocked three rollouts on 2026-09-09. The shape lives in four
/// files that have to agree, so it is pinned here instead of being left
/// to whoever edits one of them next.
// Drilled red once per assertion (2026-09-10).
#[test]
fn feat_build_1_the_scaffold_builds_static_musl_on_distroless() {
    let files = render_all(&rec(), &scaffold_features()).unwrap();
    let get = |p: &str| {
        files
            .iter()
            .find(|(path, ..)| path == p)
            .map(|(_, b, ..)| b.clone())
            .unwrap_or_else(|| panic!("{p} missing"))
    };

    // The release binary's build and its `ldd` refusal live in
    // release.rs since 3.0.0 and are pinned by its own tests.
    let release = release::musl_build_args_for(Path::new("/p"), TOOLCHAIN, 0, 0, &[]).join(" ");
    assert!(
        release.contains("cargo build --release --locked --target x86_64-unknown-linux-musl"),
        "the released binary is built for musl:\n{release}"
    );
    assert!(
        release.contains("install -y -qq musl-tools"),
        "`ring` compiles C, so the builder needs the musl C compiler:\n{release}"
    );

    let dockerfile = get("Dockerfile");
    assert!(
        dockerfile.contains("cargo build --release --locked --target x86_64-unknown-linux-musl")
            && dockerfile.contains("/src/target/x86_64-unknown-linux-musl/release/demo-svc"),
        "the image carries the same binary the release does:\n{dockerfile}"
    );
    // Everything after the last FROM is the runtime stage; the comments
    // above it explain what that stage no longer needs, so they must not
    // be what these assertions read.
    let (_, runtime) = dockerfile
        .split_once("FROM gcr.io/distroless/static:nonroot")
        .expect("the runtime stage is distroless/static");
    assert!(
        runtime.contains("USER 65532:65532"),
        "uid 65532 is built into the image:\n{runtime}"
    );
    assert!(
        !runtime.contains("apt-get")
            && !runtime.contains("useradd")
            && !runtime.contains("libssl3t64"),
        "distroless has no package manager and needs no OpenSSL:\n{runtime}"
    );

    let toolchain = get("rust-toolchain.toml");
    assert!(
        toolchain.contains(r#"targets = ["x86_64-unknown-linux-musl"]"#),
        "the pin owns the target, so no `rustup target add` can miss it:\n{toolchain}"
    );

    // The comment above the dependency explains why passkeys is absent,
    // so the dependency line itself is what this asserts on.
    let cargo = get("Cargo.toml");
    let dep = cargo
        .lines()
        .find(|l| l.starts_with("chassis = {"))
        .expect("the kit dependency line");
    assert!(
        !dep.contains("passkeys"),
        "passkeys pulls OpenSSL, which a musl build would vendor per release: {dep}"
    );
    assert!(
        dep.contains("\"dashboard\""),
        "what it does build stays: {dep}"
    );
}
