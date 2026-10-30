//! Publishing: the release notes, the `gh release create` arguments, the image
//! push with its pruning, and the release itself. The last half of a release,
//! run only after the commit and the tag are on GitHub.

use std::path::Path;

use chassis::Error;

use super::build_args::glibc_image;
use super::{MUSL_TARGET, step};
use crate::process::capture;
use crate::recorded::Recorded;
use crate::release_config::{Build, Notes};

/// How many image versions a release keeps on ghcr (3.3.0, Kenny's rule
/// that nothing grows without a bound): the newest, so a rollback has some.
pub const KEEP_IMAGES: usize = 3;

/// Whether this project's release builds and pushes a container image, and
/// why. `.chassis.toml`'s `image` decides when set. Otherwise the project's
/// deployment decides: a `deploy/service.yml` that names a `binary:` is the
/// homelab's native stack file (`chassis new` writes it), so the service
/// runs from the release binary and an image would never be pulled.
pub fn wants_image(dir: &Path, rec: &Recorded) -> (bool, String) {
    if let Some(set) = rec.image {
        return (set, "set in .chassis.toml".to_string());
    }
    let stack = dir.join("deploy/service.yml");
    let native = std::fs::read_to_string(&stack)
        .map(|s| s.lines().any(|l| l.trim_start().starts_with("binary:")))
        .unwrap_or(false);
    if native {
        (
            false,
            "deploy/service.yml names a binary: deployed as a native unit; set image = true in .chassis.toml to build one anyway".to_string(),
        )
    } else {
        (
            true,
            "no native stack file in deploy/; set image = false in .chassis.toml to skip it"
                .to_string(),
        )
    }
}

/// Deletes every image version on ghcr beyond the newest [`KEEP_IMAGES`].
/// Best effort: the release is done when this runs, so a refusal (the
/// token lacks `delete:packages`) is reported with its remedy, not raised.
pub fn prune_images(dir: &Path, rec: &Recorded) {
    let package = rec.repo.rsplit('/').next().unwrap_or(&rec.name).to_string();
    let path = format!("/user/packages/container/{package}/versions");
    let ids = match capture(dir, "gh", &["api", "--paginate", &path, "-q", ".[].id"]) {
        Ok(out) => out.lines().map(str::to_string).collect::<Vec<_>>(),
        Err(e) => {
            println!(
                "chassis release: could not list image versions on ghcr ({}); none pruned",
                e.message
            );
            return;
        }
    };
    // The API lists newest first.
    let mut removed = 0;
    for id in ids.iter().skip(KEEP_IMAGES) {
        let one = format!("{path}/{id}");
        if capture(dir, "gh", &["api", "-X", "DELETE", &one]).is_ok() {
            removed += 1;
        } else {
            println!(
                "chassis release: could not delete image version {id}; the gh token needs delete:packages (`gh auth refresh -s delete:packages`). Kept {} of {}",
                ids.len() - removed,
                ids.len()
            );
            return;
        }
    }
    println!(
        "chassis release: ghcr keeps the newest {KEEP_IMAGES} image versions ({removed} older removed)"
    );
}

/// The release's body, `release.yml`'s own text with where it was built.
pub fn release_notes(sha: &str) -> String {
    format!(
        "Built locally from `{sha}` by `chassis release`. The signature (`SHA256SUMS.minisig`) and `VERSION`
are added by `chassis release`; until they are, the self-updater ignores this release.

**Linkage: statically linked ({MUSL_TARGET}).** This binary needs no
glibc and runs on any x86_64 Linux; a deploy that checks what a staged binary
requires will find no dynamic dependency at all. `chassis release` refuses
to publish a binary with one.
"
    )
}

/// The `gh release create` arguments: the binary and the manifest, title =
/// the tag (the action's default), and never `latest` until signed (fix-10:
/// the updater reads releases/latest/download/VERSION, and an unsigned
/// release has none yet).
pub fn release_create_args(rec: &Recorded, tag: &str) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "release".into(),
        "create".into(),
        tag.into(),
        "--repo".into(),
        rec.repo.clone(),
        "--verify-tag".into(),
        "--title".into(),
        tag.into(),
    ];
    match rec.release.notes {
        Notes::Local => {
            args.push("--notes-file".into());
            args.push(rec.release.notes_file());
        }
        Notes::Generated => args.push("--generate-notes".into()),
    }
    args.push("--latest=false".into());
    for b in rec.release.binaries_or(&rec.name) {
        args.push(format!("dist/{b}"));
    }
    args.push("dist/SHA256SUMS".into());
    args
}

/// Writes the release body where [`release_create_args`] reads it.
pub fn write_notes(dir: &Path, rec: &Recorded, sha: &str) -> Result<(), Error> {
    if rec.release.notes == Notes::Generated {
        return Ok(()); // GitHub writes the body
    }
    let path = dir.join(rec.release.notes_file());
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| crate::render::io_err(&path, e))?;
    }
    let body = match rec.release.build {
        Build::Musl => release_notes(sha),
        Build::Glibc => format!(
            "Built locally from `{sha}` by `chassis release`.\n\n**Linkage: glibc ({}), dynamically linked.** Install it on a host whose glibc is at least as new as the build image's.\n",
            glibc_image(rec)
        ),
    };
    std::fs::write(&path, body).map_err(|e| crate::render::io_err(&path, e))
}

/// Pushes the image and creates the release. Called after the commit and
/// the tag are on GitHub (`--verify-tag` refuses otherwise). A failure here
/// names every command still to run, since the tag is already public.
pub fn publish(
    dir: &Path,
    rec: &Recorded,
    tag: &str,
    tags: Option<&[String; 2]>,
) -> Result<(), Error> {
    let create = format!("gh {}", release_create_args(rec, tag).join(" "));
    let sign = if rec.release.sign {
        format!(" && scripts/sign-release.sh {tag}")
    } else {
        String::new()
    };
    let rest = match tags {
        Some(t) => format!(
            "docker push {} && docker push {} && {create}{sign}",
            t[0], t[1]
        ),
        None => format!("{create}{sign}"),
    };
    for t in tags.into_iter().flatten() {
        step(dir, "push the image", "docker", &["push", t]).map_err(|e| {
            Error::dependency(
                e.message.clone(),
                format!(
                    "the commit and the tag are pushed, the image and the release are not. \
                     Log docker in to GHCR with a token that has write:packages \
                     (`docker login ghcr.io -u {owner}`), then run: {rest}",
                    owner = rec.repo.split('/').next().unwrap_or(""),
                ),
            )
        })?;
    }
    if tags.is_some() {
        prune_images(dir, rec);
    }
    let args = release_create_args(rec, tag);
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    step(dir, "GitHub release with binary + SHA256SUMS", "gh", &args).map_err(|e| {
        Error::dependency(
            e.message.clone(),
            format!(
                "the image is pushed; is gh logged in (`gh auth status`)? Then run: {create}{sign}"
            ),
        )
    })
}
