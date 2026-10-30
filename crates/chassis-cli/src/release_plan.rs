//! `chassis release --plan`: every step of a release as the command it would
//! run, printed without running any of them. Its own module because the plan
//! mirrors the real flow in `release_flow` and is read on its own (and tested
//! on its own) before anyone cuts a release. The dry run's closing summary is
//! here too: it is the same list, printed after the builds instead of before.

use std::path::Path;

use chassis::Error;
use chassis::core::update::Version;

use crate::manifest_version::current_version;
use crate::recorded::Recorded;
use crate::release;
use crate::release_changelog::check_major_has_migration;
use crate::render::io_err;

/// `--plan`: the checks that need no tools, then the steps, then nothing runs.
pub(crate) fn print_plan(
    dir: &Path,
    rec: &Recorded,
    v: Version,
    tag: &str,
    image: bool,
) -> Result<(), Error> {
    let cargo_path = dir.join("Cargo.toml");
    let cargo = std::fs::read_to_string(&cargo_path).map_err(|e| io_err(&cargo_path, e))?;
    let changelog = std::fs::read_to_string(dir.join("CHANGELOG.md")).unwrap_or_default();
    check_major_has_migration(&changelog, current_version(&cargo)?, v)?;
    println!(
        "checked: .chassis.toml present · Dockerfile and scripts/sign-release.sh present · Migration section on a major"
    );
    println!(
        "plan for {} {tag} (nothing below runs with --plan; --dry-run runs the gate and the builds):",
        rec.name
    );
    for s in release_plan(rec, &v.to_string(), tag, image) {
        println!("  {s}");
    }
    Ok(())
}

/// Every step of a release, in order, as the commands it runs.
pub(crate) fn release_plan(rec: &Recorded, v: &str, tag: &str, image: bool) -> Vec<String> {
    let [image_tag, image_latest] = release::image_tags(&rec.repo, tag);
    let mut plan = vec![
        "gate: cargo fmt --all -- --check · cargo clippy --all-targets -- -D warnings · cargo test · .claude/hooks/gates.project.sh (when present) · cargo run -q -- --version".into(),
        if image {
            format!("gate: cargo deny check all · docker build -t {0}:ci . · docker run --rm {0}:ci --version · --healthcheck must refuse a closed port · cargo llvm-cov --summary-only (informational)", rec.name)
        } else {
            "gate: cargo deny check all · cargo llvm-cov --summary-only (informational) · no container image (native)".to_string()
        },
        format!("write Cargo.toml version = \"{v}\" and a {v} section in CHANGELOG.md; cargo update -w"),
        format!("git commit -am 'chore(release): {v} [meta]' && git tag {tag}   # the commit runs the project's hooks"),
        format!("check: tag {tag} names the version Cargo.toml says"),
        release::build_plan_line(rec),
        format!("docker build -t {image_tag} -t {image_latest} . && docker run --rm {image_tag} --version"),
        format!("git push origin HEAD:main && git push origin {tag}"),
        format!("docker push {image_tag} && docker push {image_latest}; then keep the newest {} image versions on ghcr", release::KEEP_IMAGES),
        format!("gh {}", release::release_create_args(rec, tag).join(" ")),
        if rec.release.sign {
            format!("scripts/sign-release.sh {tag}   # minisign asks for the key password; uploads .minisig then VERSION, then marks it latest")
        } else {
            "no signing step ([release] sign = false): you sign the release afterwards".to_string()
        },
    ];
    let hooks = &rec.release.hooks;
    if !hooks.pre_gate.is_empty() || hooks.tag_notes.is_some() {
        let mut line = format!("hooks before the gate: {}", hooks.pre_gate.join(" · "));
        if let Some(t) = &hooks.tag_notes {
            line.push_str(&format!(
                " · tag_notes {t} (the tag is annotated with its output)"
            ));
        }
        plan.insert(0, line);
    }
    if !hooks.post_gate.is_empty() {
        plan.insert(
            if hooks.pre_gate.is_empty() && hooks.tag_notes.is_none() {
                2
            } else {
                3
            },
            format!("hooks after the gate: {}", hooks.post_gate.join(" · ")),
        );
    }
    if !image {
        plan.retain(|s| !s.starts_with("docker build -t ") && !s.starts_with("docker push "));
    }
    plan
}

/// What a dry run proved and what a real release would do next.
pub(crate) fn print_dry_run_summary(
    rec: &Recorded,
    tag: &str,
    v: Version,
    images: Option<&[String; 2]>,
) {
    println!("chassis release: dry run for {tag} complete. Built and verified:");
    for b in rec.release.binaries_or(&rec.name) {
        println!("  dist/{b}");
    }
    println!("  dist/SHA256SUMS  ({})", release::linkage_label(rec));
    if let Some(images) = images {
        println!("  {}  {}", images[0], images[1]);
    }
    println!("Cargo.toml and Cargo.lock are back as they were. A real release would now:");
    println!(
        "  write the {v} section in CHANGELOG.md, git commit -am 'chore(release): {v} [meta]', git tag {tag}"
    );
    println!("  git push origin HEAD:main && git push origin {tag}");
    if let Some(images) = images {
        println!("  docker push {} && docker push {}", images[0], images[1]);
    }
    println!("  gh {}", release::release_create_args(rec, tag).join(" "));
    if rec.release.sign {
        println!(
            "  scripts/sign-release.sh {tag}   # minisign asks for the key password; uploads .minisig then VERSION"
        );
    } else {
        println!("  (no signing step: [release] sign = false)");
    }
}
