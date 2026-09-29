//! The local half of `chassis release` (3.0.0; Kenny, 2026-09-29: "tests and
//! release builds run locally, then the result is uploaded").
//!
//! Until 2.4.x a project carried two GitHub Actions workflows the scaffold
//! wrote: `ci.yml` (fmt, clippy, tests, the project's gates, `--version`,
//! cargo-deny, the image smoke, coverage) and `release.yml` (a static musl
//! binary built in `rust:<toolchain>-slim-trixie`, an `ldd` refusal,
//! `SHA256SUMS`, the image pushed to GHCR, and the GitHub release). The
//! release command pushed a branch, waited for the first, tagged, and waited
//! for the second. Both now run here, step for step, so nothing waits on a
//! runner and the release is built from the tree that was just gated:
//!
//! - [`gate`] is everything `ci.yml` ran, in the same order.
//! - [`build_binary`] and [`build_image`] are what `release.yml` built,
//!   with the same docker invocation, asset names and image tags.
//! - [`publish`] is what `release.yml` uploaded: the image and the release,
//!   still without taking `latest` (fix-10); signing takes it afterwards.
//!
//! Every step prints what it runs and streams its output, so a gate that
//! takes minutes is visibly doing something.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use chassis::Error;

use crate::{Recorded, capture, command};

/// The one release target (feat-build-1): statically linked, so the host's
/// glibc stops deciding whether the service starts.
pub const MUSL_TARGET: &str = "x86_64-unknown-linux-musl";

/// Where the musl build writes, inside the project (gitignored by the
/// scaffold's `.gitignore`). Separate from `target/` so a glibc debug build
/// and the release build never invalidate each other.
pub const MUSL_TARGET_DIR: &str = "target-musl";

/// The environment variable a project's `.claude/hooks/gates.project.sh`
/// sees when the release gate runs it — the local stand-in for the `CI=true`
/// a GitHub runner exported, for a project gate that runs heavier checks
/// there (kyu's container smoke).
pub const RELEASE_GATE_ENV: &str = "CHASSIS_RELEASE_GATE";

/// Runs one step with its output streamed, and names it first.
fn step(dir: &Path, what: &str, program: &str, args: &[&str]) -> Result<(), Error> {
    step_env(dir, what, program, args, &[])
}

fn step_env(
    dir: &Path,
    what: &str,
    program: &str,
    args: &[&str],
    env: &[(&str, &str)],
) -> Result<(), Error> {
    println!("chassis release: {what}: {program} {}", args.join(" "));
    let mut cmd = command(program, dir);
    cmd.args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    for (k, v) in env {
        cmd.env(k, v);
    }
    let status = cmd.status().map_err(|e| {
        Error::dependency(
            format!("cannot run {program}: {e}"),
            format!("is {program} installed and on PATH?"),
        )
    })?;
    if status.success() {
        Ok(())
    } else {
        Err(Error::dependency(
            format!("{what} failed ({program} {}: {status})", args.join(" ")),
            "read its output above; nothing after this step ran",
        ))
    }
}

fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(path).is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

/// Whether `cargo <sub>` exists here (cargo-deny, cargo-llvm-cov are cargo
/// plugins, so `require_tool` on the plugin name would miss them).
pub fn cargo_plugin_available(dir: &Path, sub: &str) -> bool {
    command("cargo", dir)
        .args([sub, "--version"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|s| s.success())
}

/// Kenny, 2026-09-29: "drie keer dezelfde testrun is dom, dat moet naar
/// één". The scaffold's pre-commit hook stamps the tree its gates saw green
/// (`~/Projects/workstation/bin/gate-stamp`); when HEAD's clean tree is that
/// tree, fmt, clippy and the tests have run on it already. A missing helper
/// or any failure means "not fresh", so the gate runs.
fn gate_stamp_fresh(dir: &Path) -> bool {
    let Some(home) = std::env::var_os("HOME") else {
        return false;
    };
    let helper = Path::new(&home).join("Projects/workstation/bin/gate-stamp");
    helper.is_file()
        && std::process::Command::new(&helper)
            .arg("fresh")
            .current_dir(dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
}

/// Everything the scaffold's `ci.yml` ran, in its order, on this machine.
///
/// The three required jobs (gates, cargo-deny, container build) refuse the
/// release; coverage was informational in CI (`continue-on-error: true`) and
/// stays informational here: it reports and never stops.
pub fn gate(dir: &Path, rec: &Recorded) -> Result<(), Error> {
    // Job `fmt · clippy · tests`, unless the commit gate already ran it on
    // exactly this tree (one full test run per release).
    if gate_stamp_fresh(dir) {
        println!(
            "chassis release: fmt · clippy · tests already green on this tree at commit (gate-stamp); not run again"
        );
    } else {
        step(
            dir,
            "format check",
            "cargo",
            &["fmt", "--all", "--", "--check"],
        )?;
        step(
            dir,
            "clippy (warnings are errors)",
            "cargo",
            &["clippy", "--all-targets", "--", "-D", "warnings"],
        )?;
        step(dir, "tests", "cargo", &["test"])?;
    }
    let project_gates = dir.join(".claude/hooks/gates.project.sh");
    if is_executable(&project_gates) {
        step_env(
            dir,
            "project gates",
            ".claude/hooks/gates.project.sh",
            &[],
            &[(RELEASE_GATE_ENV, "1")],
        )?;
    } else {
        println!("chassis release: project gates: none (.claude/hooks/gates.project.sh absent)");
    }
    step(
        dir,
        "the binary answers --version without configuration (AR20)",
        "cargo",
        &["run", "-q", "--", "--version"],
    )?;

    // Job `cargo-deny (advisories · licenses · bans)`.
    step(dir, "cargo-deny", "cargo", &["deny", "check", "all"])?;

    // Job `container build`.
    let image = format!("{}:ci", rec.name);
    step(
        dir,
        "container build",
        "docker",
        &["build", "-t", &image, "."],
    )?;
    step(
        dir,
        "the image answers --version",
        "docker",
        &["run", "--rm", &image, "--version"],
    )?;
    println!("chassis release: --healthcheck must refuse a closed port");
    let refused = command("docker", dir)
        .args([
            "run",
            "--rm",
            &image,
            "--healthcheck",
            "http://127.0.0.1:1/healthz",
        ])
        .status()
        .map_err(|e| {
            Error::dependency(format!("cannot run docker: {e}"), "is docker installed?")
        })?;
    if refused.success() {
        return Err(Error::internal(
            "the image's --healthcheck passed against a closed port",
            "a healthcheck that cannot fail proves nothing; fix the binary's --healthcheck",
        ));
    }

    // Job `coverage (informational)`.
    coverage(dir);
    println!("chassis release: gate green");
    Ok(())
}

fn coverage(dir: &Path) {
    if !cargo_plugin_available(dir, "llvm-cov") {
        println!(
            "chassis release: coverage (informational): skipped, cargo-llvm-cov is not installed here \
             (cargo install cargo-llvm-cov --locked && rustup component add llvm-tools-preview)"
        );
        return;
    }
    if let Err(e) = step(
        dir,
        "coverage (informational)",
        "cargo",
        &["llvm-cov", "--summary-only"],
    ) {
        println!(
            "chassis release: coverage (informational) did not finish ({}); not a gate, continuing",
            e.message
        );
    }
}

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

/// The docker arguments of the musl build, exactly as `release.yml` ran
/// them, plus one `chown` at the end: a runner threw its checkout away, a
/// workstation keeps it, and files the container wrote as root would stay
/// root-owned in the project.
pub fn musl_build_args(abs_dir: &Path, toolchain: &str, uid: u32, gid: u32) -> Vec<String> {
    let script = format!(
        "apt-get update -qq >/dev/null && apt-get install -y -qq musl-tools >/dev/null \
         && cargo build --release --locked --target {MUSL_TARGET}; \
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

/// Builds `dist/<name>` and `dist/SHA256SUMS` the way `release.yml` did,
/// then refuses a binary with a dynamic link. Returns the dist directory.
pub fn build_binary(dir: &Path, rec: &Recorded) -> Result<PathBuf, Error> {
    let abs = std::fs::canonicalize(dir).map_err(|e| {
        Error::config(
            format!("cannot resolve {}: {e}", dir.display()),
            "run chassis release in the project root",
        )
    })?;
    let (uid, gid) = owner_of(&abs);
    let args = musl_build_args(&abs, &rec.toolchain, uid, gid);
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    step(
        dir,
        &format!("static release binary ({MUSL_TARGET})"),
        "docker",
        &args,
    )?;

    let dist = abs.join("dist");
    match std::fs::remove_dir_all(&dist) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(crate::io_err(&dist, e)),
    }
    std::fs::create_dir_all(&dist).map_err(|e| crate::io_err(&dist, e))?;
    let built = abs
        .join(MUSL_TARGET_DIR)
        .join(MUSL_TARGET)
        .join("release")
        .join(&rec.name);
    let shipped = dist.join(&rec.name);
    std::fs::copy(&built, &shipped).map_err(|e| {
        Error::internal(
            format!("cannot copy {} to dist/: {e}", built.display()),
            "the build step above reported success but left no binary; is the package's binary named like .chassis.toml's `name`?",
        )
    })?;
    let sums = capture(&dist, "sha256sum", &[&rec.name])?;
    std::fs::write(dist.join("SHA256SUMS"), &sums)
        .map_err(|e| crate::io_err(&dist.join("SHA256SUMS"), e))?;
    print!("{sums}");

    println!(
        "chassis release: the released binary has no dynamic links: ldd dist/{}",
        rec.name
    );
    let ldd = command("ldd", &dist).arg(&rec.name).output().map_err(|e| {
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
                "dist/{} links shared libraries and would not start on a host with an older glibc",
                rec.name
            ),
            "check the build used --target x86_64-unknown-linux-musl, and that no enabled feature needs OpenSSL (`passkeys` does)",
        ));
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

/// Where the release body is written for `gh release create --notes-file`;
/// inside the musl build directory, so `dist/` holds exactly the two assets.
pub const NOTES_FILE: &str = "target-musl/release-notes.md";

/// The `gh release create` arguments: the binary and the manifest, title =
/// the tag (the action's default), and never `latest` until signed (fix-10:
/// the updater reads releases/latest/download/VERSION, and an unsigned
/// release has none yet).
pub fn release_create_args(rec: &Recorded, tag: &str) -> Vec<String> {
    vec![
        "release".into(),
        "create".into(),
        tag.into(),
        "--repo".into(),
        rec.repo.clone(),
        "--verify-tag".into(),
        "--title".into(),
        tag.into(),
        "--notes-file".into(),
        NOTES_FILE.into(),
        "--latest=false".into(),
        format!("dist/{}", rec.name),
        "dist/SHA256SUMS".into(),
    ]
}

/// Writes the release body where [`release_create_args`] reads it.
pub fn write_notes(dir: &Path, sha: &str) -> Result<(), Error> {
    let path = dir.join(NOTES_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| crate::io_err(&path, e))?;
    }
    std::fs::write(&path, release_notes(sha)).map_err(|e| crate::io_err(&path, e))
}

/// Pushes the image and creates the release. Called after the commit and
/// the tag are on GitHub (`--verify-tag` refuses otherwise). A failure here
/// names every command still to run, since the tag is already public.
pub fn publish(dir: &Path, rec: &Recorded, tag: &str, tags: &[String; 2]) -> Result<(), Error> {
    let create = format!("gh {}", release_create_args(rec, tag).join(" "));
    let rest = format!(
        "docker push {t0} && docker push {t1} && {create} && scripts/sign-release.sh {tag}",
        t0 = tags[0],
        t1 = tags[1],
    );
    for t in tags {
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
    let args = release_create_args(rec, tag);
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    step(dir, "GitHub release with binary + SHA256SUMS", "gh", &args).map_err(|e| {
        Error::dependency(
            e.message.clone(),
            format!("the image is pushed; is gh logged in (`gh auth status`)? Then run: {create} && scripts/sign-release.sh {tag}"),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec() -> Recorded {
        Recorded {
            name: "demo-svc".into(),
            description: "A demo".into(),
            repo: "kennypassenier/demo-svc".into(),
            toolchain: "1.97".into(),
            chassis_tag: "v0.1.0".into(),
            chassis_repo: crate::CHASSIS_REPO.into(),
            chassis_path: None,
            kp_themes: crate::KP_THEMES.into(),
            state_dir: "/var/lib/demo-svc".into(),
            latch: false,
            env_file: None,
            latch_env: None,
            deny_ignore: Vec::new(),
            unit_service: Vec::new(),
            required_checks: Vec::new(),
            vmid: 0,
        }
    }

    /// The musl build is release.yml's docker invocation: same image, same
    /// mounts and variables, same apt line, same cargo command.
    #[test]
    fn the_musl_build_is_the_workflows_docker_invocation() {
        let args = musl_build_args(Path::new("/p/demo-svc"), "1.97", 1000, 1000);
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
}
