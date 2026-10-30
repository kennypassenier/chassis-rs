//! The lines of `.chassis.toml` the sync rewrites (`kp_themes`, `chassis_tag`)
//! and the record entries and files the kit has retired. Its own module
//! because every edit here is a targeted line edit that keeps the record's
//! comments, which the toml crate would drop on a round trip.

use std::path::Path;

use chassis::Error;

use super::Drift;
use super::kit_dependency::normalise;

/// Rewrites the `chassis_tag` line of a `.chassis.toml` (feat-sync-1).
/// Same shape as [`set_kp_themes`]: the line's own comment survives, so the
/// record keeps whatever note it carried.
pub fn set_chassis_tag(chassis_toml: &str, tag: &str) -> Result<String, Error> {
    set_record_line(chassis_toml, "chassis_tag", tag)
}

// ───────────────────────── kp_themes vs the vendored files ─────────────────────────

/// The kit's own kp-themes manifest: a header naming the release, then one
/// hash per vendored file. Read at compile time from the sibling crate, so
/// the CLI can only ever claim the version the static files actually are.
pub const KP_THEMES_MANIFEST: &str = include_str!("../../../chassis/static/kp/KP_THEMES.sha256");

/// The kp-themes version this kit vendors, from the manifest's first line
/// (`# @kp-soft/themes v11.3.0 — …`).
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
    set_record_line(chassis_toml, "kp_themes", version)
}

/// Rewrites one `key = "value"` line of `.chassis.toml`, keeping the line's
/// own trailing comment: the record is read by people and its notes are the
/// reason a value is what it is.
fn set_record_line(chassis_toml: &str, key: &str, value: &str) -> Result<String, Error> {
    let mut found = false;
    let mut out = String::with_capacity(chassis_toml.len());
    for line in chassis_toml.split_inclusive('\n') {
        if !found && line.trim_start().starts_with(key) {
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
            out.push_str(&format!("{key} = \"{value}\"{comment}"));
            found = true;
        } else {
            out.push_str(line);
        }
    }
    if !found {
        return Err(Error::config(
            format!(".chassis.toml has no {key} line to update"),
            format!("add `{key} = \"{value}\"` to .chassis.toml by hand"),
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

// ───────────────────────── files the kit no longer ships ─────────────────────────

/// A kit-owned file a project received from an earlier kit and must not keep.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Obsolete {
    pub path: &'static str,
    /// Why it went and what took its place.
    pub why: &'static str,
}

impl Obsolete {
    pub fn drift(&self) -> Drift {
        Drift::new(
            "obsolete file",
            format!("{} is still here", self.path),
            format!("not shipped by the kit since 3.0.0 ({})", self.why),
            "`chassis sync --write` removes it".into(),
        )
    }
}

/// Kenny, 2026-09-29: tests and release builds run locally, and GitHub
/// Actions builds nothing. Left in place, `ci.yml` would keep running on
/// every push with nobody waiting for it, and `release.yml` would race
/// `chassis release` for the same tag: both building, both pushing the
/// image, the second `gh release create` failing.
pub const OBSOLETE_FILES: &[Obsolete] = &[
    Obsolete {
        path: ".github/workflows/ci.yml",
        why: "`chassis release` runs the same gate on this machine",
    },
    Obsolete {
        path: ".github/workflows/release.yml",
        why: "`chassis release` builds and publishes the release on this machine",
    },
];

/// `.chassis.toml` `required_checks` named CI jobs `main` waited for
/// (Kenny, 2026-09-25). With no CI there is no job to wait for, and a
/// record that still lists one reads as if something checks it.
pub fn required_checks_drift(recorded: &[String]) -> Option<Drift> {
    (!recorded.is_empty()).then(|| {
        Drift::new(
            ".chassis.toml required_checks",
            format!("lists {}", recorded.join(", ")),
            "no CI checks (the kit ships no CI workflow since 3.0.0)".into(),
            "delete the line (and its comment); `chassis sync --protect` drops the requirement from main".into(),
        )
    })
}

#[cfg(test)]
mod tests;
