//! The docker arguments of the release build and the one-line descriptions of
//! it. Pure functions of the record, so the plan and the dry-run summary can
//! print exactly what the build will run, and tests can pin the invocation.

use std::path::Path;

use super::{MUSL_TARGET, MUSL_TARGET_DIR};
use crate::recorded::Recorded;
use crate::release_config::Build;

/// ` --bin a --bin b` for a project that names its binaries; nothing when
/// it does not, which builds what the manifest builds, as before.
pub(super) fn bin_flags(binaries: &[String]) -> String {
    binaries.iter().map(|b| format!(" --bin {b}")).collect()
}

/// The docker arguments of the musl build, exactly as `release.yml` ran
/// them, plus one `chown` at the end: a runner threw its checkout away, a
/// workstation keeps it, and files the container wrote as root would stay
/// root-owned in the project.
///
/// `binaries` is `[release] binaries`: empty builds what the manifest builds
/// (today's behaviour), otherwise one `--bin` per name (homelab-shared-4).
pub fn musl_build_args_for(
    abs_dir: &Path,
    toolchain: &str,
    uid: u32,
    gid: u32,
    binaries: &[String],
) -> Vec<String> {
    let bins = bin_flags(binaries);
    let script = format!(
        "apt-get update -qq >/dev/null && apt-get install -y -qq musl-tools >/dev/null \
         && cargo build --release --locked --target {MUSL_TARGET}{bins}; \
         status=$?; chown -R {uid}:{gid} /w/{MUSL_TARGET_DIR}; exit $status"
    );
    vec![
        "run".into(),
        "--rm".into(),
        "-v".into(),
        format!("{}:/w", abs_dir.display()),
        "-w".into(),
        "/w".into(),
        "-e".into(),
        format!("CARGO_TARGET_DIR=/w/{MUSL_TARGET_DIR}"),
        "-e".into(),
        format!("CARGO_HOME=/w/{MUSL_TARGET_DIR}/cargo-home"),
        format!("rust:{toolchain}-slim-trixie"),
        "sh".into(),
        "-c".into(),
        script,
    ]
}

/// The glibc alternative (homelab-shared-4): the same mounts and variables,
/// a Debian image, no musl toolchain, output in `target-glibc`.
pub fn glibc_build_args(
    abs_dir: &Path,
    image: &str,
    uid: u32,
    gid: u32,
    binaries: &[String],
) -> Vec<String> {
    let dir = "target-glibc";
    let bins = bin_flags(binaries);
    let script = format!(
        "cargo build --release --locked{bins}; status=$?; chown -R {uid}:{gid} /w/{dir}; exit $status"
    );
    vec![
        "run".into(),
        "--rm".into(),
        "-v".into(),
        format!("{}:/w", abs_dir.display()),
        "-w".into(),
        "/w".into(),
        "-e".into(),
        format!("CARGO_TARGET_DIR=/w/{dir}"),
        "-e".into(),
        format!("CARGO_HOME=/w/{dir}/cargo-home"),
        image.into(),
        "sh".into(),
        "-c".into(),
        script,
    ]
}

/// The glibc build's image: `[release] glibc_image`, else the older Debian
/// (bookworm) so the binary also runs on a newer host.
pub fn glibc_image(rec: &Recorded) -> String {
    rec.release
        .glibc_image
        .clone()
        .unwrap_or_else(|| format!("rust:{}-slim-bookworm", rec.toolchain))
}

/// The one-line description of the build, for the plan.
pub fn build_plan_line(rec: &Recorded) -> String {
    let bins = rec.release.binaries_or(&rec.name);
    let list = bins
        .iter()
        .map(|b| format!("dist/{b}"))
        .collect::<Vec<_>>()
        .join(" + ");
    match rec.release.build {
        Build::Musl => format!(
            "docker run … rust:{}-slim-trixie cargo build --release --locked --target {MUSL_TARGET} → {list} + dist/SHA256SUMS; refuse any `=>` in ldd",
            rec.toolchain
        ),
        Build::Glibc => format!(
            "docker run … {} cargo build --release --locked → {list} + dist/SHA256SUMS (glibc, dynamically linked; no ldd check)",
            glibc_image(rec)
        ),
    }
}

/// What the dry run says about the built binaries' linkage.
pub fn linkage_label(rec: &Recorded) -> &'static str {
    match rec.release.build {
        Build::Musl => "static, no dynamic links",
        Build::Glibc => "glibc, dynamically linked",
    }
}
