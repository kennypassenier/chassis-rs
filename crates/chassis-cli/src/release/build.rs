//! Building the release assets on this machine: the binaries in a container,
//! `SHA256SUMS`, the refusal of a dynamic link, and the image. Split from the
//! gate because these steps produce what gets published.

use std::path::{Path, PathBuf};

use chassis::Error;

use super::build_args::{glibc_build_args, glibc_image, musl_build_args_for};
use super::{MUSL_TARGET, step};
use crate::process::{capture, command};
use crate::recorded::Recorded;
use crate::release_config::Build;

/// `tag v1.2.3` must be the version `Cargo.toml` names, or the self-updater
/// either never updates or updates on every poll (release.yml's first step).
pub fn check_tag_matches(tag: &str, cargo_version: &str) -> Result<(), Error> {
    let from_tag = tag.trim_start_matches('v');
    if from_tag == cargo_version {
        Ok(())
    } else {
        Err(Error::invalid(
            format!("tag v{from_tag} but Cargo.toml says {cargo_version}"),
            "bump Cargo.toml (chassis release does this) and re-tag",
        ))
    }
}

/// `ldd` is not a yes/no oracle: on a static binary it exits non-zero or
/// prints "not a dynamic executable"/"statically linked", so neither its
/// exit code nor the presence of output can be the signal. A resolved
/// shared library is what is refused, and that is exactly a `=>` line.
pub fn has_dynamic_links(ldd_output: &str) -> bool {
    ldd_output.contains("=>")
}

fn owner_of(dir: &Path) -> (u32, u32) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        std::fs::metadata(dir)
            .map(|m| (m.uid(), m.gid()))
            .unwrap_or((0, 0))
    }
    #[cfg(not(unix))]
    {
        let _ = dir;
        (0, 0)
    }
}

/// Builds `dist/<binary>` for every binary of the release and
/// `dist/SHA256SUMS` the way `release.yml` did, then (musl only) refuses a
/// binary with a dynamic link. Returns the dist directory.
pub fn build_binary(dir: &Path, rec: &Recorded) -> Result<PathBuf, Error> {
    let abs = std::fs::canonicalize(dir).map_err(|e| {
        Error::config(
            format!("cannot resolve {}: {e}", dir.display()),
            "run chassis release in the project root",
        )
    })?;
    let (uid, gid) = owner_of(&abs);
    let binaries = rec.release.binaries_or(&rec.name);
    let (what, args) = match rec.release.build {
        Build::Musl => (
            format!("static release binary ({MUSL_TARGET})"),
            musl_build_args_for(&abs, &rec.toolchain, uid, gid, &rec.release.binaries),
        ),
        Build::Glibc => (
            format!("glibc release binaries ({})", glibc_image(rec)),
            glibc_build_args(&abs, &glibc_image(rec), uid, gid, &rec.release.binaries),
        ),
    };
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    step(dir, &what, "docker", &args)?;

    let dist = abs.join("dist");
    match std::fs::remove_dir_all(&dist) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(crate::render::io_err(&dist, e)),
    }
    std::fs::create_dir_all(&dist).map_err(|e| crate::render::io_err(&dist, e))?;
    for binary in &binaries {
        let built = abs.join(rec.release.built_path(binary));
        std::fs::copy(&built, dist.join(binary)).map_err(|e| {
            Error::internal(
                format!("cannot copy {} to dist/: {e}", built.display()),
                "the build step above reported success but left no binary; is it named like .chassis.toml's `name` (or each entry of [release] binaries)?",
            )
        })?;
    }
    let names: Vec<&str> = binaries.iter().map(String::as_str).collect();
    let sums = capture(&dist, "sha256sum", &names)?;
    std::fs::write(dist.join("SHA256SUMS"), &sums)
        .map_err(|e| crate::render::io_err(&dist.join("SHA256SUMS"), e))?;
    print!("{sums}");

    if rec.release.build == Build::Glibc {
        println!(
            "chassis release: glibc build ([release] build = \"glibc\"): the no-dynamic-links check is for musl and is skipped"
        );
        return Ok(dist);
    }
    for binary in &binaries {
        println!("chassis release: the released binary has no dynamic links: ldd dist/{binary}");
        let ldd = command("ldd", &dist).arg(binary).output().map_err(|e| {
            Error::dependency(
                format!("cannot run ldd: {e}"),
                "ldd comes with glibc (Arch/Garuda: package glibc); install it",
            )
        })?;
        let links = format!(
            "{}{}",
            String::from_utf8_lossy(&ldd.stdout),
            String::from_utf8_lossy(&ldd.stderr)
        );
        println!("{}", links.trim_end());
        if has_dynamic_links(&links) {
            return Err(Error::internal(
                format!(
                    "dist/{binary} links shared libraries and would not start on a host with an older glibc"
                ),
                "check the build used --target x86_64-unknown-linux-musl, and that no enabled feature needs OpenSSL (`passkeys` does); or set [release] build = \"glibc\"",
            ));
        }
    }
    Ok(dist)
}

/// The two tags `release.yml` pushed: the version tag and `latest`.
pub fn image_tags(repo: &str, tag: &str) -> [String; 2] {
    [
        format!("ghcr.io/{repo}:{tag}"),
        format!("ghcr.io/{repo}:latest"),
    ]
}

/// Builds the release image under both tags and proves it answers
/// `--version` with the version being released.
///
/// One label beyond what the workflow wrote: a package pushed with
/// GITHUB_TOKEN was linked to its repository by GitHub itself; pushed from
/// here it is linked by `org.opencontainers.image.source`.
pub fn build_image(dir: &Path, rec: &Recorded, tag: &str) -> Result<[String; 2], Error> {
    let tags = image_tags(&rec.repo, tag);
    let source = format!(
        "org.opencontainers.image.source=https://github.com/{}",
        rec.repo
    );
    step(
        dir,
        "release image",
        "docker",
        &[
            "build", "-t", &tags[0], "-t", &tags[1], "--label", &source, ".",
        ],
    )?;
    let answer = capture(dir, "docker", &["run", "--rm", &tags[0], "--version"])?;
    println!("{}", answer.trim_end());
    let version = tag.trim_start_matches('v');
    if !answer.contains(version) {
        return Err(Error::internal(
            format!(
                "the image {} answers `{}`, not {version}",
                tags[0],
                answer.trim()
            ),
            "the image was built from another tree than the tag; rerun from the release commit",
        ));
    }
    Ok(tags)
}
