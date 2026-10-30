//! The `[release]` table of `.chassis.toml` (homelab-shared-4): what a
//! project whose release is not "one musl binary named like the package"
//! says about its release. Every key has a default that is today's
//! behaviour, so a `.chassis.toml` without the table releases exactly as
//! before, and an unchanged record is written back without the table.
//!
//! ```toml
//! [release]
//! binaries = ["homelab-host", "homelab", "homelab-admin"]
//! build = "glibc"          # or "musl" (default)
//! glibc_image = "rust:1.97-slim-bookworm"
//! sign = false             # the owner signs outside the tool
//! notes = "generated"      # or "local" (default)
//!
//! [release.hooks]
//! pre_gate = ["scripts/measure-due.py --run"]
//! post_gate = ["scripts/host-drift.sh"]
//! tag_notes = "scripts/release-record.sh"
//! ```

use serde::{Deserialize, Serialize};

/// Which toolchain image builds the release binaries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Build {
    /// A static musl binary in `rust:<toolchain>-slim-trixie` (the default).
    #[default]
    Musl,
    /// A dynamically linked glibc binary in a Debian image, for a host
    /// that needs it (OpenSSL through `passkeys`, a system library).
    Glibc,
}

/// Where the GitHub release body comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Notes {
    /// The text `chassis release` writes (the default).
    #[default]
    Local,
    /// GitHub's generated notes (`gh release create --generate-notes`).
    Generated,
}

/// Project scripts the release calls. Each entry is one command line,
/// split on whitespace and run from the project root with
/// `CHASSIS_RELEASE_VERSION`, `CHASSIS_RELEASE_TAG` and
/// `CHASSIS_RELEASE_DRY_RUN` (`1`/`0`) in its environment. A non-zero exit
/// stops the release before it changes anything it cannot undo.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Hooks {
    /// After the repository checks, before the gate. Run in order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pre_gate: Vec<String>,
    /// After the gate is green, before the version is written.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub post_gate: Vec<String>,
    /// Prints the text of the tag's annotation on stdout (an override
    /// record, say). Set: the tag is annotated with it; unset: the tag is
    /// the lightweight tag it always was. Runs right after `pre_gate`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag_notes: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReleaseConfig {
    /// The binaries one release ships, each as `dist/<name>` and in
    /// `SHA256SUMS`. Empty: the one binary named like the project.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub binaries: Vec<String>,
    #[serde(default)]
    pub build: Build,
    /// The glibc build's image; default `rust:<toolchain>-slim-bookworm`
    /// (the older Debian, so the binary runs on both).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub glibc_image: Option<String>,
    /// Whether `scripts/sign-release.sh` runs at the end. `false`: the
    /// release is created unsigned and the command to sign it is printed.
    #[serde(default = "yes")]
    pub sign: bool,
    #[serde(default)]
    pub notes: Notes,
    #[serde(default)]
    pub hooks: Hooks,
}

fn yes() -> bool {
    true
}

impl Default for ReleaseConfig {
    fn default() -> Self {
        Self {
            binaries: Vec::new(),
            build: Build::Musl,
            glibc_image: None,
            sign: true,
            notes: Notes::Local,
            hooks: Hooks::default(),
        }
    }
}

impl ReleaseConfig {
    pub fn is_default(&self) -> bool {
        *self == Self::default()
    }

    /// The binaries to ship: the configured list, or the project's name.
    pub fn binaries_or(&self, name: &str) -> Vec<String> {
        if self.binaries.is_empty() {
            vec![name.to_string()]
        } else {
            self.binaries.clone()
        }
    }

    /// Refuses what would only fail late: a binary name with a path in
    /// it, a duplicate, or a hook line that names nothing.
    pub fn validate(&self) -> Result<(), chassis::Error> {
        let mut seen = std::collections::BTreeSet::new();
        for b in &self.binaries {
            let ok = !b.is_empty()
                && b.chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
            if !ok || !seen.insert(b.as_str()) {
                return Err(chassis::Error::config(
                    format!("[release] binaries: `{b}` is empty, repeated or not a file name"),
                    "list each binary once, by its file name (letters, digits, '-', '_', '.')",
                ));
            }
        }
        let hooks = self
            .hooks
            .pre_gate
            .iter()
            .chain(&self.hooks.post_gate)
            .chain(self.hooks.tag_notes.iter());
        for h in hooks {
            if h.split_whitespace().next().is_none() {
                return Err(chassis::Error::config(
                    "[release.hooks] has an empty command",
                    "name the script to run, e.g. \"scripts/measure-due.py --run\"",
                ));
            }
        }
        Ok(())
    }

    /// Directory the release build writes, inside the project.
    pub fn target_dir(&self) -> &'static str {
        match self.build {
            Build::Musl => crate::release::MUSL_TARGET_DIR,
            Build::Glibc => "target-glibc",
        }
    }

    /// Where `cargo build --release` leaves a binary, relative to the project.
    pub fn built_path(&self, binary: &str) -> std::path::PathBuf {
        let mut p = std::path::PathBuf::from(self.target_dir());
        if self.build == Build::Musl {
            p.push(crate::release::MUSL_TARGET);
        }
        p.push("release");
        p.push(binary);
        p
    }

    /// Where the release body is written for `--notes-file`.
    pub fn notes_file(&self) -> String {
        format!("{}/release-notes.md", self.target_dir())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_absent_table_is_the_default_and_is_not_written_back() {
        let c: ReleaseConfig = toml::from_str("").unwrap();
        assert!(c.is_default());
        assert_eq!(c.binaries_or("svc"), vec!["svc".to_string()]);
        assert_eq!(c.build, Build::Musl);
        assert!(c.sign);
        assert_eq!(c.notes_file(), "target-musl/release-notes.md");
        assert_eq!(
            c.built_path("svc"),
            std::path::Path::new("target-musl/x86_64-unknown-linux-musl/release/svc")
        );
    }

    #[test]
    fn every_key_parses() {
        let c: ReleaseConfig = toml::from_str(
            r#"
binaries = ["a", "b"]
build = "glibc"
glibc_image = "rust:1.97-slim-bookworm"
sign = false
notes = "generated"
[hooks]
pre_gate = ["scripts/one --x", "scripts/two"]
post_gate = ["scripts/three"]
tag_notes = "scripts/notes"
"#,
        )
        .unwrap();
        c.validate().unwrap();
        assert_eq!(c.binaries_or("ignored"), ["a", "b"]);
        assert_eq!(c.build, Build::Glibc);
        assert!(!c.sign);
        assert_eq!(c.notes, Notes::Generated);
        assert_eq!(c.hooks.pre_gate.len(), 2);
        assert_eq!(c.hooks.tag_notes.as_deref(), Some("scripts/notes"));
        assert_eq!(c.notes_file(), "target-glibc/release-notes.md");
        assert_eq!(
            c.built_path("a"),
            std::path::Path::new("target-glibc/release/a")
        );
    }

    #[test]
    fn nonsense_is_refused_before_anything_runs() {
        let bad = |t: &str| {
            toml::from_str::<ReleaseConfig>(t)
                .unwrap()
                .validate()
                .is_err()
        };
        assert!(bad("binaries = [\"a/b\"]"));
        assert!(bad("binaries = [\"a\", \"a\"]"));
        assert!(bad("binaries = [\"\"]"));
        assert!(bad("[hooks]\npre_gate = [\"  \"]"));
        assert!(toml::from_str::<ReleaseConfig>("build = \"clang\"").is_err());
    }
}
