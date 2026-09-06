//! K32: drift that is not a file. `chassis sync` diffs the kit-owned files,
//! but three things it could not see went wrong on 2026-09-06 — Almanac
//! pinned kit 1.7.0 in `Cargo.toml` while `.chassis.toml` said 1.7.1; kyu's
//! branch protection still required the retired check `gates`; and
//! `.chassis.toml`'s `kp_themes` claimed a version nothing verified. This
//! module compares each of them and reports every difference in one shape,
//! `! <what>: <project value> vs <expected> — <remedy>`, printed after the
//! file diffs and counted as drift (exit 1).
//!
//! Every comparison is a pure function over strings or lists, so the tests
//! need no network; only `fetch_protection` talks to GitHub, and only when
//! `sync --remote` asks for it — CI runs a plain `sync` offline.

use std::fmt;
use std::path::Path;
use std::process::Command;

use chassis::Error;

/// One difference that is not a file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Drift {
    pub what: String,
    pub project: String,
    pub expected: String,
    pub remedy: String,
}

impl Drift {
    fn new(what: &str, project: String, expected: String, remedy: String) -> Self {
        Self {
            what: what.to_string(),
            project,
            expected,
            remedy,
        }
    }
}

impl fmt::Display for Drift {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "! {}: {} vs {} — {}",
            self.what, self.project, self.expected, self.remedy
        )
    }
}

// ───────────────────────── kit tag vs Cargo.toml ─────────────────────────

/// What a project's `Cargo.toml` says about the kit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KitDependency {
    /// `chassis = { git = …, tag = "vX.Y.Z", version = "X.Y.Z", … }` — the
    /// shape the scaffold writes. A bare `chassis = "X.Y.Z"` lands here with
    /// no tag, which is reported: the kit is not on crates.io.
    Git {
        tag: Option<String>,
        version: Option<String>,
    },
    /// A local checkout (drills, kit work): there is no tag to compare.
    Path(String),
    Missing,
}

/// Reads the `chassis` dependency out of a `Cargo.toml`.
pub fn kit_dependency(cargo_toml: &str) -> Result<KitDependency, Error> {
    let table: toml::Table = cargo_toml.parse().map_err(|e| {
        Error::config(
            format!("Cargo.toml does not parse: {e}"),
            "fix the file; `cargo metadata` reports the same error with a line number",
        )
    })?;
    let dep = table
        .get("dependencies")
        .and_then(|d| d.get("chassis"))
        .or_else(|| {
            table
                .get("workspace")
                .and_then(|w| w.get("dependencies"))
                .and_then(|d| d.get("chassis"))
        });
    let string_of =
        |t: &toml::Table, key: &str| t.get(key).and_then(|v| v.as_str()).map(str::to_string);
    Ok(match dep {
        None => KitDependency::Missing,
        Some(toml::Value::String(version)) => KitDependency::Git {
            tag: None,
            version: Some(version.clone()),
        },
        Some(toml::Value::Table(t)) => match string_of(t, "path") {
            Some(path) => KitDependency::Path(path),
            None => KitDependency::Git {
                tag: string_of(t, "tag"),
                version: string_of(t, "version"),
            },
        },
        Some(other) => {
            return Err(Error::config(
                format!(
                    "the chassis dependency in Cargo.toml is a {}, not a table",
                    other.type_str()
                ),
                "write it as `chassis = { git = \"…\", tag = \"vX.Y.Z\", version = \"X.Y.Z\", features = [...] }` (see the scaffold's Cargo.toml)",
            ));
        }
    })
}

/// `v1.7.1`, `1.7.1`, `^1.7.1` and `=1.7.1` all name the same release.
fn normalise(version: &str) -> &str {
    version.trim().trim_start_matches(['v', '^', '=']).trim()
}

/// Compares `Cargo.toml`'s kit dependency with `.chassis.toml`'s `chassis_tag`.
/// A path dependency yields nothing: the caller reports it as a note.
pub fn kit_tag_drift(dep: &KitDependency, chassis_tag: &str) -> Vec<Drift> {
    let expected = normalise(chassis_tag);
    let says = format!(".chassis.toml says {chassis_tag}");
    match dep {
        KitDependency::Path(_) => Vec::new(),
        KitDependency::Missing => vec![Drift::new(
            "kit dependency",
            "Cargo.toml has no chassis dependency".into(),
            says,
            "add `chassis = { git = \"<chassis_repo>\", tag = \"<chassis_tag>\", version = \"<X.Y.Z>\", features = [...] }` under [dependencies] (the scaffold's Cargo.toml shows the line)".into(),
        )],
        KitDependency::Git { tag, version } => {
            let mut out = Vec::new();
            match tag {
                None => out.push(Drift::new(
                    "kit tag",
                    "Cargo.toml pins no tag".into(),
                    says.clone(),
                    format!(
                        "add `tag = \"{chassis_tag}\"` to the chassis dependency (the kit is a git dependency, not a crates.io one), then cargo update -p chassis"
                    ),
                )),
                Some(tag) if normalise(tag) != expected => out.push(Drift::new(
                    "kit tag",
                    format!("Cargo.toml pins {tag}"),
                    says.clone(),
                    "bump the tag in Cargo.toml or chassis_tag in .chassis.toml so they agree, then cargo update -p chassis".into(),
                )),
                Some(_) => {}
            }
            if let Some(version) = version
                && normalise(version) != expected
            {
                out.push(Drift::new(
                    "kit version",
                    format!("Cargo.toml requires version {version}"),
                    says,
                    format!(
                        "set `version = \"{expected}\"` next to the tag (cargo-deny refuses a git dependency without one), then cargo update -p chassis"
                    ),
                ));
            }
            out
        }
    }
}

// ───────────────────────── kp_themes vs the vendored files ─────────────────────────

/// The kit's own kp-themes manifest: a header naming the release, then one
/// hash per vendored file. Read at compile time from the sibling crate, so
/// the CLI can only ever claim the version the static files actually are.
pub const KP_THEMES_MANIFEST: &str = include_str!("../../chassis/static/kp/KP_THEMES.sha256");

/// The kp-themes version this kit vendors, from the manifest's first line
/// (`# @kp-soft/themes v3.1.0 — …`).
pub fn vendored_kp_themes() -> &'static str {
    KP_THEMES_MANIFEST
        .lines()
        .next()
        .and_then(|header| {
            header.split_whitespace().find_map(|word| {
                word.strip_prefix('v')
                    .filter(|v| v.chars().next().is_some_and(|c| c.is_ascii_digit()))
            })
        })
        .expect("KP_THEMES.sha256 names its version on the first line")
}

/// Compares `.chassis.toml`'s `kp_themes` with what the kit vendors.
pub fn kp_themes_drift(recorded: &str, vendored: &str) -> Option<Drift> {
    (normalise(recorded) != normalise(vendored)).then(|| {
        Drift::new(
            "kp_themes",
            format!(".chassis.toml records {recorded}"),
            format!("the kit at this version vendors kp-themes {vendored}"),
            "update kp_themes in .chassis.toml (`chassis sync --write` does it; the kit is the source of truth here)".into(),
        )
    })
}

/// Rewrites the `kp_themes = "…"` line of a `.chassis.toml`, leaving every
/// other line — comments included — untouched. The toml crate would drop
/// the comments on a round trip, so this is a targeted line edit that
/// refuses when the line is not there.
pub fn set_kp_themes(chassis_toml: &str, version: &str) -> Result<String, Error> {
    let mut found = false;
    let mut out = String::with_capacity(chassis_toml.len());
    for line in chassis_toml.split_inclusive('\n') {
        if !found && line.trim_start().starts_with("kp_themes") {
            let comment = line
                .split_once('#')
                .map(|(_, c)| format!(" #{c}"))
                .unwrap_or_else(|| {
                    if line.ends_with('\n') {
                        "\n".into()
                    } else {
                        String::new()
                    }
                });
            out.push_str(&format!("kp_themes = \"{version}\"{comment}"));
            found = true;
        } else {
            out.push_str(line);
        }
    }
    if !found {
        return Err(Error::config(
            ".chassis.toml has no kp_themes line to update",
            format!("add `kp_themes = \"{version}\"` to .chassis.toml by hand"),
        ));
    }
    Ok(out)
}

/// Writes through a sibling temp file and a rename, so a crash mid-write
/// leaves the old `.chassis.toml` rather than half of the new one.
pub fn write_atomically(path: &Path, body: &str) -> Result<(), Error> {
    let tmp = path.with_extension("toml.tmp");
    let fail = |e: std::io::Error| {
        Error::config(
            format!("cannot write {}: {e}", path.display()),
            "check the directory's permissions and free space",
        )
    };
    std::fs::write(&tmp, body).map_err(fail)?;
    std::fs::rename(&tmp, path).map_err(fail)
}

// ───────────────────────── branch protection vs CI ─────────────────────────

/// The checks `main` must wait for: the scaffold's non-informational CI
/// job names. `protect_main` sets them and `sync --remote` compares them,
/// and a test checks they equal the rendered `ci.yml`, so a renamed job
/// cannot leave the three apart (kyu's protection required `gates` for a
/// week after CI stopped producing it).
pub const REQUIRED_CHECKS: &[&str] = &[
    "fmt · clippy · tests",
    "cargo-deny (advisories · licenses · bans)",
    "container build",
];

/// The part of GitHub's branch protection the kit owns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Protection {
    pub checks: Vec<String>,
    /// "Require branches to be up to date before merging".
    pub strict: bool,
    pub enforce_admins: bool,
}

impl Protection {
    /// What `chassis sync --protect` sets.
    pub fn expected() -> Self {
        Self {
            checks: REQUIRED_CHECKS.iter().map(|c| c.to_string()).collect(),
            strict: true,
            enforce_admins: true,
        }
    }
}

/// Reads `GET repos/<repo>/branches/main/protection` into a `Protection`.
pub fn parse_protection(json: &str) -> Result<Protection, Error> {
    let v: serde_json::Value = serde_json::from_str(json).map_err(|e| {
        Error::dependency(
            format!("the branch protection response is not JSON: {e}"),
            "run `gh api repos/<owner>/<name>/branches/main/protection` by hand and read what GitHub answers",
        )
    })?;
    let status = &v["required_status_checks"];
    let mut checks: Vec<String> = status["contexts"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|c| c.as_str().map(str::to_string))
        .collect();
    // Newer payloads carry `checks[].context` next to (or instead of) `contexts`.
    for c in status["checks"].as_array().into_iter().flatten() {
        if let Some(name) = c["context"].as_str()
            && !checks.iter().any(|k| k == name)
        {
            checks.push(name.to_string());
        }
    }
    Ok(Protection {
        checks,
        strict: status["strict"].as_bool().unwrap_or(false),
        enforce_admins: v["enforce_admins"]["enabled"].as_bool().unwrap_or(false),
    })
}

const PROTECT_REMEDY: &str = "run `chassis sync --protect` (sets the kit's checks, strict and enforce_admins, and reads them back)";

/// Compares what protection requires with what the kit sets: one line per
/// missing check, extra check, and per flag that differs.
pub fn protection_drift(expected: &Protection, actual: &Protection) -> Vec<Drift> {
    let mut out = Vec::new();
    for missing in expected
        .checks
        .iter()
        .filter(|c| !actual.checks.contains(c))
    {
        out.push(Drift::new(
            "branch protection",
            format!("does not require `{missing}`"),
            "a CI job of that name that main must wait for".into(),
            PROTECT_REMEDY.into(),
        ));
    }
    for extra in actual
        .checks
        .iter()
        .filter(|c| !expected.checks.contains(c))
    {
        out.push(Drift::new(
            "branch protection",
            format!("requires `{extra}`"),
            "no CI job of that name (main could never merge on it)".into(),
            PROTECT_REMEDY.into(),
        ));
    }
    if expected.strict != actual.strict {
        out.push(Drift::new(
            "branch protection",
            format!("strict = {}", actual.strict),
            format!("strict = {}", expected.strict),
            PROTECT_REMEDY.into(),
        ));
    }
    if expected.enforce_admins != actual.enforce_admins {
        out.push(Drift::new(
            "branch protection",
            format!("enforce_admins = {}", actual.enforce_admins),
            format!("enforce_admins = {}", expected.enforce_admins),
            PROTECT_REMEDY.into(),
        ));
    }
    out
}

/// `sync --remote`: the current protection of `main`, or `None` when the
/// branch is not protected at all. Needs `gh` logged in.
pub fn fetch_protection(repo: &str) -> Result<Option<Protection>, Error> {
    let out = Command::new("gh")
        .args([
            "api",
            &format!("repos/{repo}/branches/main/protection"),
        ])
        .output()
        .map_err(|e| {
            Error::dependency(
                format!("cannot run gh: {e}"),
                "install the GitHub CLI and run `gh auth login`, or drop --remote (sync stays offline without it)",
            )
        })?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    if out.status.success() {
        return parse_protection(&stdout).map(Some);
    }
    // gh prints GitHub's JSON error on stdout and its own summary on stderr;
    // an unprotected branch is a 404 with this message, not a failure.
    if stdout.contains("Branch not protected") || stderr.contains("Branch not protected") {
        return Ok(None);
    }
    Err(Error::dependency(
        format!(
            "gh api repos/{repo}/branches/main/protection failed: {}",
            stderr.trim()
        ),
        "is gh logged in (`gh auth status`) with access to this repository?",
    ))
}

/// Everything `--remote` compares, as drift lines.
pub fn remote_drift(repo: &str) -> Result<Vec<Drift>, Error> {
    let expected = Protection::expected();
    Ok(match fetch_protection(repo)? {
        Some(actual) => protection_drift(&expected, &actual),
        None => vec![Drift::new(
            "branch protection",
            "main is not protected".into(),
            format!("the kit's checks required ({})", REQUIRED_CHECKS.join(", ")),
            "run `chassis sync --protect` once CI has run on the repository (rule 6a)".into(),
        )],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const GIT_DEP: &str = r#"
[package]
name = "demo"
version = "0.1.0"

[dependencies]
# the kit
chassis = { git = "https://github.com/kennypassenier/chassis-rs", tag = "v1.7.1", version = "1.7.1", features = ["dashboard"] }
axum = "0.8"
"#;

    // Drilled red once (expected a drift line for the matching tag): failed, restored.
    #[test]
    fn k32_matching_kit_tag_is_no_drift() {
        let dep = kit_dependency(GIT_DEP).unwrap();
        assert_eq!(
            dep,
            KitDependency::Git {
                tag: Some("v1.7.1".into()),
                version: Some("1.7.1".into()),
            }
        );
        assert!(kit_tag_drift(&dep, "v1.7.1").is_empty());
        assert!(
            kit_tag_drift(&dep, "1.7.1").is_empty(),
            "vX.Y.Z and X.Y.Z name the same tag"
        );
    }

    // Drilled red once (flipped the expected line count to 0): failed, restored.
    #[test]
    fn k32_kit_tag_mismatch_is_one_line_with_the_remedy() {
        // Almanac, 2026-09-06: Cargo.toml still on 1.7.0, .chassis.toml on 1.7.1.
        let dep = kit_dependency(&GIT_DEP.replace("1.7.1", "1.7.0")).unwrap();
        let drift = kit_tag_drift(&dep, "v1.7.1");
        assert_eq!(drift.len(), 2, "tag and version both lag: {drift:?}");
        assert_eq!(
            drift[0].to_string(),
            "! kit tag: Cargo.toml pins v1.7.0 vs .chassis.toml says v1.7.1 — bump the tag in Cargo.toml or chassis_tag in .chassis.toml so they agree, then cargo update -p chassis"
        );
        assert!(drift[1].to_string().starts_with("! kit version: Cargo.toml requires version 1.7.0 vs .chassis.toml says v1.7.1 — set `version = \"1.7.1\"`"));
        // Only the tag lags: one line.
        let dep = kit_dependency(&GIT_DEP.replace("tag = \"v1.7.1\"", "tag = \"v1.7.0\"")).unwrap();
        assert_eq!(kit_tag_drift(&dep, "v1.7.1").len(), 1);
        // No tag at all (a crates.io-style line) is drift too: the kit is git-only.
        let dep = kit_dependency("[dependencies]\nchassis = \"1.7.1\"\n").unwrap();
        let drift = kit_tag_drift(&dep, "v1.7.1");
        assert_eq!(drift.len(), 1);
        assert!(drift[0].to_string().contains("pins no tag"), "{}", drift[0]);
        assert_eq!(
            kit_tag_drift(&KitDependency::Missing, "v1.7.1").len(),
            1,
            "a project without the kit is reported, not skipped"
        );
    }

    // Drilled red once (asserted one drift line for the path dependency): failed, restored.
    #[test]
    fn k32_a_path_dependency_is_informative_not_drift() {
        let cargo = "[dependencies]\nchassis = { path = \"/home/kenny/Projects/chassis-rs/crates/chassis\", version = \"1.7.1\", features = [\"dashboard\"] }\n";
        let dep = kit_dependency(cargo).unwrap();
        assert_eq!(
            dep,
            KitDependency::Path("/home/kenny/Projects/chassis-rs/crates/chassis".into())
        );
        assert!(
            kit_tag_drift(&dep, "v0.0.0-test").is_empty(),
            "a drill's path dependency has no tag to compare"
        );
        assert!(
            kit_dependency("this is not toml [").is_err(),
            "a broken Cargo.toml is an error with a remedy, not silence"
        );
    }

    // Drilled red once (compared against "3.0.0" instead of the manifest): failed, restored.
    #[test]
    fn k32_vendored_kp_themes_comes_from_the_manifest_header() {
        let v = vendored_kp_themes();
        assert!(
            KP_THEMES_MANIFEST.starts_with(&format!("# @kp-soft/themes v{v} ")),
            "{v} is the header's version"
        );
        assert!(
            v.split('.').count() == 3 && v.split('.').all(|p| p.parse::<u32>().is_ok()),
            "{v} is X.Y.Z"
        );
        assert!(kp_themes_drift(v, v).is_none());
    }

    // Drilled red once (expected None for the mismatch): failed, restored.
    #[test]
    fn k32_kp_themes_mismatch_is_one_line_and_write_fixes_the_file_keeping_comments() {
        let drift = kp_themes_drift("3.0.0", "3.1.0").expect("a mismatch");
        assert_eq!(
            drift.to_string(),
            "! kp_themes: .chassis.toml records 3.0.0 vs the kit at this version vendors kp-themes 3.1.0 — update kp_themes in .chassis.toml (`chassis sync --write` does it; the kit is the source of truth here)"
        );
        let before = "# Written by `chassis new`; read by `chassis sync` and `chassis release`.\nname = \"almanac\"\n# measured on CT 112\nkp_themes = \"3.0.0\" # bumped by hand\nstate_dir = \"/var/lib/almanac\"\n";
        let after = set_kp_themes(before, "3.1.0").unwrap();
        assert_eq!(
            after,
            "# Written by `chassis new`; read by `chassis sync` and `chassis release`.\nname = \"almanac\"\n# measured on CT 112\nkp_themes = \"3.1.0\" # bumped by hand\nstate_dir = \"/var/lib/almanac\"\n"
        );
        let parsed: toml::Table = after.parse().unwrap();
        assert_eq!(parsed["kp_themes"].as_str(), Some("3.1.0"));
        // Without a trailing comment the line is just the value.
        assert_eq!(
            set_kp_themes("kp_themes = \"3.0.0\"\nlatch = false\n", "3.1.0").unwrap(),
            "kp_themes = \"3.1.0\"\nlatch = false\n"
        );
        let err = set_kp_themes("name = \"x\"\n", "3.1.0").unwrap_err();
        assert!(err.to_string().contains("no kp_themes line"), "{err}");
        // The atomic write leaves no temp file behind and the content is what was given.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".chassis.toml");
        std::fs::write(&path, before).unwrap();
        write_atomically(&path, &after).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), after);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    fn protection(checks: &[&str], strict: bool, enforce_admins: bool) -> Protection {
        Protection {
            checks: checks.iter().map(|c| c.to_string()).collect(),
            strict,
            enforce_admins,
        }
    }

    // Drilled red once (asserted a line for identical protection): failed, restored.
    #[test]
    fn k32_identical_protection_is_no_drift() {
        let expected = Protection::expected();
        assert!(protection_drift(&expected, &expected.clone()).is_empty());
        // Order does not matter: the API returns the checks as a set.
        let mut reversed = expected.clone();
        reversed.checks.reverse();
        assert!(protection_drift(&expected, &reversed).is_empty());
    }

    // Drilled red once (expected zero lines for the missing check): failed, restored.
    #[test]
    fn k32_a_missing_check_is_one_line() {
        // chassis-rs itself, measured 2026-09-06: no `container build`.
        let actual = protection(
            &[
                "fmt · clippy · tests",
                "cargo-deny (advisories · licenses · bans)",
            ],
            true,
            true,
        );
        let drift = protection_drift(&Protection::expected(), &actual);
        assert_eq!(drift.len(), 1, "{drift:?}");
        assert_eq!(
            drift[0].to_string(),
            "! branch protection: does not require `container build` vs a CI job of that name that main must wait for — run `chassis sync --protect` (sets the kit's checks, strict and enforce_admins, and reads them back)"
        );
    }

    // Drilled red once (expected zero lines for the extra check): failed, restored.
    #[test]
    fn k32_an_extra_check_is_one_line() {
        // kyu, 2026-09-06: the retired job `gates` still required next to the three.
        let mut actual = Protection::expected();
        actual.checks.push("gates".into());
        let drift = protection_drift(&Protection::expected(), &actual);
        assert_eq!(drift.len(), 1, "{drift:?}");
        assert!(
            drift[0]
                .to_string()
                .starts_with("! branch protection: requires `gates` vs no CI job of that name"),
            "{}",
            drift[0]
        );
    }

    // Drilled red once (expected zero lines for strict = false): failed, restored.
    #[test]
    fn k32_strict_false_is_one_line() {
        let actual = protection(REQUIRED_CHECKS, false, true);
        let drift = protection_drift(&Protection::expected(), &actual);
        assert_eq!(drift.len(), 1, "{drift:?}");
        assert!(
            drift[0]
                .to_string()
                .starts_with("! branch protection: strict = false vs strict = true — "),
            "{}",
            drift[0]
        );
        let actual = protection(REQUIRED_CHECKS, true, false);
        assert_eq!(
            protection_drift(&Protection::expected(), &actual)[0].project,
            "enforce_admins = false"
        );
    }

    // Drilled red once (asserted `strict: false` on the real payload): failed, restored.
    #[test]
    fn k32_the_github_payload_parses_into_a_protection() {
        // chassis-rs main, `gh api …/branches/main/protection`, 2026-09-06, trimmed.
        let json = r#"{"required_status_checks":{"strict":true,"contexts":["fmt · clippy · tests","cargo-deny (advisories · licenses · bans)"],"checks":[{"context":"fmt · clippy · tests","app_id":15368},{"context":"cargo-deny (advisories · licenses · bans)","app_id":15368}]},"enforce_admins":{"enabled":true},"allow_force_pushes":{"enabled":false}}"#;
        let p = parse_protection(json).unwrap();
        assert_eq!(
            p,
            protection(
                &[
                    "fmt · clippy · tests",
                    "cargo-deny (advisories · licenses · bans)"
                ],
                true,
                true
            ),
            "contexts and checks name the same jobs once"
        );
        // A payload with only `checks` (newer API shape) still yields the names.
        let p = parse_protection(
            r#"{"required_status_checks":{"strict":false,"checks":[{"context":"gates"}]},"enforce_admins":{"enabled":false}}"#,
        )
        .unwrap();
        assert_eq!(p, protection(&["gates"], false, false));
        assert!(parse_protection("not json").is_err());
    }
}
