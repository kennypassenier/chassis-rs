//! What the `chassis` commands do to a generated project, one phase per
//! function: sync (clean, restoring, unfixable drift), the release plan and
//! the build. The phases run in order on one project on disk.

use std::process::Command;

use super::generated_project::Project;
use super::support::{chassis, regex_free_replace_path_dep};

/// The scaffold's own sync sees no drift — in the files and (K32) in the
/// kit tag, kp_themes and the path dependency it reports as a note.
/// Drilled red once (misspelt the note's needle): failed, restored.
pub fn sync_is_clean(p: &Project) {
    let out = chassis()
        .args(["sync", "--dir", p.root.to_str().unwrap()])
        .output()
        .unwrap();
    let sync_out = String::from_utf8_lossy(&out.stdout);
    assert!(
        out.status.success(),
        "sync right after new must be clean: {sync_out}"
    );
    assert!(
        sync_out.contains("in sync with the scaffold of chassis"),
        "{sync_out}"
    );
    assert!(
        sync_out.contains("path dependency"),
        "a --chassis-path project is told its tag is not compared: {sync_out}"
    );
}

/// K34: the smoke test is the kit's, so a sync puts it back instead of
/// leaving a project on a harness the kit no longer has. Drilled red once
/// by listing the scaffold entry as `owned(...)`: sync reported the file
/// and left the vandalised copy in place.
pub fn sync_restores_the_smoke_test(p: &Project, smoke: &str) {
    let smoke_path = p.root.join("tests/kit_smoke.rs");
    std::fs::write(&smoke_path, "// gone\n").unwrap();
    let out = chassis()
        .args(["sync", "--write", "--dir", p.root.to_str().unwrap()])
        .output()
        .unwrap();
    let sync_out = String::from_utf8_lossy(&out.stdout);
    assert!(out.status.success(), "{sync_out}");
    assert_eq!(
        std::fs::read_to_string(&smoke_path).unwrap(),
        smoke,
        "sync rewrote the kit-owned smoke test: {sync_out}"
    );
}

/// D1 (K32, 2026-09-07): drift --write cannot fix exits 1 even with
/// --write, so a script never reads "green" over a red line. A git
/// dependency pinned to a foreign tag stands in for the real case
/// (Almanac on v1.7.0 while .chassis.toml said v1.7.1). Drilled red once
/// (the exit code still followed `changed && !write`): failed, restored.
pub fn unfixable_drift_exits_one(p: &Project) {
    let cargo_toml = p.root.join("Cargo.toml");
    let pinned = std::fs::read_to_string(&cargo_toml).unwrap();
    let foreign = regex_free_replace_path_dep(&pinned);
    assert_ne!(foreign, pinned, "the kit dependency line was found");
    std::fs::write(&cargo_toml, &foreign).unwrap();
    let out = chassis()
        .args(["sync", "--write", "--dir", p.root.to_str().unwrap()])
        .output()
        .unwrap();
    let drift_out = String::from_utf8_lossy(&out.stdout);
    assert_eq!(
        out.status.code(),
        Some(1),
        "unresolved kit-tag drift must exit 1 under --write: {drift_out}"
    );
    assert!(drift_out.contains("! kit tag"), "{drift_out}");
    std::fs::write(&cargo_toml, &pinned).unwrap();
    let out = chassis()
        .args(["sync", "--dir", p.root.to_str().unwrap()])
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "clean again after restoring Cargo.toml"
    );
}

/// A release plan names every step without running any of them. (The
/// `--dry-run` that runs the gate and builds the assets needs docker and
/// a project that builds inside a container, which a `--chassis-path`
/// project is not; release.rs pins its pieces instead.)
pub fn release_plan_names_every_step(p: &Project) {
    let out = chassis()
        .args([
            "release",
            "0.2.0",
            "--dir",
            p.root.to_str().unwrap(),
            "--plan",
        ])
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let plan = String::from_utf8_lossy(&out.stdout);
    for needle in [
        "Cargo.toml version = \"0.2.0\"",
        "cargo deny check all",
        "git tag v0.2.0",
        "--target x86_64-unknown-linux-musl",
        "--latest=false",
        "sign-release.sh v0.2.0",
        // 3.3.0: `chassis new` writes the native stack file, so a new
        // project's release builds no container image.
        "container image: no",
    ] {
        assert!(plan.contains(needle), "release plan lacks {needle}: {plan}");
    }
    assert!(
        !plan.contains("docker push"),
        "3.3.0: a native project pushes no image: {plan}"
    );
    assert!(
        !plan.contains("release-0.2.0"),
        "3.0.0: no release branch, no wait for CI: {plan}"
    );
    assert_eq!(
        std::fs::read_to_string(p.root.join("Cargo.toml"))
            .unwrap()
            .matches("0.2.0")
            .count(),
        0,
        "the plan wrote nothing"
    );
}

/// It builds and runs: the generated main.rs against this kit.
pub fn builds_and_answers_version(p: &Project) {
    let build = Command::new("cargo")
        .args(["build", "--quiet", "--offline"])
        .env("CARGO_TARGET_DIR", &p.target)
        .current_dir(&p.root)
        .output()
        .unwrap();
    let build = if build.status.success() {
        build
    } else {
        // The registry cache may lack a crate the generated project needs;
        // one online build fills it and is what a real user gets anyway.
        Command::new("cargo")
            .args(["build", "--quiet"])
            .env("CARGO_TARGET_DIR", &p.target)
            .current_dir(&p.root)
            .output()
            .unwrap()
    };
    assert!(
        build.status.success(),
        "generated project does not build: {}",
        String::from_utf8_lossy(&build.stderr)
    );
    let out = Command::new(p.target.join("debug").join("demo-svc"))
        .args(["--version"])
        .env_clear()
        .output()
        .unwrap();
    assert!(out.status.success());
    assert_eq!(
        String::from_utf8_lossy(&out.stdout).trim(),
        "demo-svc 0.1.0"
    );
}

/// --check without secrets refuses with the gen-secret remedy (W6) — the
/// generated project carries the kit's behaviour unchanged.
pub fn check_without_secrets_names_gen_secret(p: &Project) {
    let out = Command::new(p.target.join("debug").join("demo-svc"))
        .args(["--check", "--state-dir", p.tmp.path().to_str().unwrap()])
        .env_clear()
        .output()
        .unwrap();
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("gen-secret"));
}
