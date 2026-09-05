//! The pure half of self-update (K18–K21, AR8): deciding whether a
//! release is newer, what a starting process does about a pending
//! update, which mode is in force, and whether a manifest line matches.
//! Downloading, verifying signatures, swapping files and restarting are
//! `shell::update`'s job. Everything here is provable without a network
//! or a crash loop, which is where the expensive mistakes live —
//! reverting on the very start that should succeed, or never reverting
//! because the counter was written after the crash instead of before.
//!
//! Ported from Almanac's `core/update.rs` (nine decision cases), with the
//! critic's corrections: `MAX_START_ATTEMPTS` is a knob, a pending update
//! blocks a new one, the drill marker is version-bound, and the hold knob
//! pins or skips.

use serde::{Deserialize, Serialize};

use crate::core::crypto::ct_eq;
use crate::core::error::Error;

/// `MAJOR.MINOR.PATCH`, compared numerically. Pre-release suffixes are
/// refused: a release is a release.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Version {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
}

impl Version {
    pub fn parse(text: &str) -> Result<Self, Error> {
        let t = text.trim().trim_start_matches('v');
        let parts: Vec<&str> = t.split('.').collect();
        let bad = || {
            Error::invalid(
                format!("`{text}` is not a version of the form MAJOR.MINOR.PATCH"),
                "the release's VERSION file must contain exactly x.y.z",
            )
        };
        if parts.len() != 3 {
            return Err(bad());
        }
        let n = |s: &str| s.parse::<u64>().map_err(|_| bad());
        Ok(Version {
            major: n(parts[0])?,
            minor: n(parts[1])?,
            patch: n(parts[2])?,
        })
    }
}

impl std::fmt::Display for Version {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

/// Strictly newer only: never downgrade, never reinstall the same.
pub fn should_update(running: Version, candidate: Version) -> bool {
    candidate > running
}

/// The hold knob (K20): `pin` keeps exactly this version; `skip` refuses
/// exactly one version and installs anything newer; `none` holds nothing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Hold {
    None,
    Pin(Version),
    Skip(Version),
}

impl Hold {
    /// `""` → none; `1.4.0` or `pin:1.4.0` → pin; `skip:1.4.0` → skip.
    pub fn parse(raw: &str) -> Result<Hold, Error> {
        let r = raw.trim();
        if r.is_empty() {
            return Ok(Hold::None);
        }
        if let Some(v) = r.strip_prefix("skip:") {
            return Ok(Hold::Skip(Version::parse(v)?));
        }
        let v = r.strip_prefix("pin:").unwrap_or(r);
        Ok(Hold::Pin(Version::parse(v)?))
    }

    /// Whether `candidate` may be installed over `running` under this hold.
    pub fn allows(&self, running: Version, candidate: Version) -> bool {
        match self {
            Hold::None => true,
            Hold::Pin(v) => candidate == *v && candidate != running,
            Hold::Skip(v) => candidate != *v,
        }
    }
}

/// The hash a `SHA256SUMS` manifest records for `filename`. Accepts both
/// `hash  name` and `hash *name` (binary mode).
pub fn hash_for(manifest: &str, filename: &str) -> Result<String, Error> {
    for line in manifest.lines() {
        let mut parts = line.split_whitespace();
        let (Some(hash), Some(name)) = (parts.next(), parts.next()) else {
            continue;
        };
        if name.trim_start_matches('*') == filename {
            return Ok(hash.to_ascii_lowercase());
        }
    }
    Err(Error::config(
        format!("the release manifest has no entry for `{filename}`"),
        "the release is incomplete or was built differently; do not install it",
    ))
}

/// Case-insensitive, constant-time: this is an integrity decision.
pub fn hash_matches(expected: &str, actual: &str) -> bool {
    ct_eq(
        expected.to_ascii_lowercase().as_bytes(),
        actual.to_ascii_lowercase().as_bytes(),
    )
}

/// The three modes (AR8). Exactly one is in force; `Off` may be the
/// result of container detection as well as of configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Off,
    Supervised,
    Autonomous,
}

impl Mode {
    pub fn parse(raw: &str) -> Result<Mode, Error> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "off" | "" => Ok(Mode::Off),
            "supervised" => Ok(Mode::Supervised),
            "autonomous" => Ok(Mode::Autonomous),
            other => Err(Error::config(
                format!("update_mode `{other}` is not one of off, supervised, autonomous"),
                "supervised = the homelab runs `<binary> update`; autonomous = this process checks and restarts itself; off = never",
            )),
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Mode::Off => "off",
            Mode::Supervised => "supervised",
            Mode::Autonomous => "autonomous",
        }
    }
}

/// What the shell saw of the container it may be in.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ContainerEvidence {
    /// `/.dockerenv` exists (Docker).
    pub dockerenv: bool,
    /// `/run/.containerenv` exists (Podman).
    pub containerenv: bool,
    /// `/proc/1/cgroup`, empty if unreadable.
    pub pid1_cgroup: String,
}

/// Inside an image somebody else builds and ships? **LXC does not count**
/// (critic #19): the LXC is the long-lived machine this is built for.
/// Only OCI runtimes force the module off, because a binary rewritten
/// inside such a container is lost at the next recreate while looking
/// identical to the image.
pub fn is_managed_image(e: &ContainerEvidence) -> bool {
    if e.dockerenv || e.containerenv {
        return true;
    }
    e.pid1_cgroup.lines().any(|line| {
        ["/docker", "/docker-", "libpod", "containerd"]
            .iter()
            .any(|m| line.contains(m))
    })
}

/// The effective mode and the one-line reason the log states.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Effective {
    pub mode: Mode,
    pub reason: &'static str,
}

pub fn effective_mode(configured: Mode, evidence: &ContainerEvidence) -> Effective {
    match configured {
        Mode::Off => Effective {
            mode: Mode::Off,
            reason: "update_mode is off",
        },
        Mode::Supervised => Effective {
            mode: Mode::Supervised,
            reason: "update_mode is supervised: `<binary> update` does one attempt, the supervisor restarts",
        },
        Mode::Autonomous if is_managed_image(evidence) => Effective {
            mode: Mode::Off,
            reason: "update_mode is autonomous but this is an OCI container: a rewritten binary would be lost at the next recreate, so the module is off",
        },
        Mode::Autonomous => Effective {
            mode: Mode::Autonomous,
            reason: "update_mode is autonomous: this process checks, installs and restarts itself",
        },
    }
}

/// What an autonomous update left behind for the next start to find
/// (AR9). Exists on disk exactly while an update is on probation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateState {
    pub from_version: String,
    pub to_version: String,
    /// Where the replaced binary was kept, so a revert is a rename rather
    /// than another download from a host that may be what went wrong.
    pub previous_binary: String,
    /// Starts of the unproven version so far.
    #[serde(default)]
    pub attempts: u32,
}

/// What a starting process does about a pending update.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StartAction {
    Normal,
    /// First (or a still-allowed) start of the new version: persist the
    /// returned state, serve, clear it once healthy.
    Probation(UpdateState),
    /// The new version failed to prove itself: put the previous binary
    /// back, notify, exit so the supervisor starts the restored one.
    Revert(UpdateState),
    /// The state names a version that is not the one running (a manual
    /// reinstall, or the supervisor already rolled back): clear it and
    /// start normally (critic #20).
    Stale(UpdateState),
}

/// Count this start as an attempt and decide. `running` is the version of
/// the binary that is executing this code.
pub fn decide_at_startup(
    state: Option<UpdateState>,
    running: &str,
    max_attempts: u32,
) -> StartAction {
    let Some(mut state) = state else {
        return StartAction::Normal;
    };
    if state.to_version != running {
        return StartAction::Stale(state);
    }
    state.attempts = state.attempts.saturating_add(1);
    if state.attempts >= max_attempts.max(1) {
        StartAction::Revert(state)
    } else {
        StartAction::Probation(state)
    }
}

/// The drill marker (K20, critic #6) is version-bound: only the version
/// it names breaks, once; the restored previous version runs normally.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DrillMarker {
    pub version: String,
    /// `broken` = exit before READY; `broken-after-ready` = exit a few
    /// seconds after READY (exposes a supervisor that samples once).
    pub kind: String,
}

/// Whether the running binary should sabotage itself for the drill.
pub fn drill_applies<'a>(marker: Option<&'a DrillMarker>, running: &str) -> Option<&'a str> {
    match marker {
        Some(m) if m.version == running => Some(m.kind.as_str()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(s: &str) -> Version {
        Version::parse(s).unwrap()
    }

    #[test]
    fn versions_parse_and_compare_numerically() {
        assert!(v("1.10.0") > v("1.9.9"), "numeric, not lexical");
        assert!(v("2.0.0") > v("1.99.99"));
        assert_eq!(v("v1.2.3"), v("1.2.3"));
        assert!(Version::parse("1.2").is_err());
        assert!(Version::parse("1.2.3-beta").is_err());
        assert_eq!(v("1.2.3").to_string(), "1.2.3");
    }

    #[test]
    fn only_strictly_newer_updates() {
        assert!(should_update(v("1.0.0"), v("1.0.1")));
        assert!(!should_update(v("1.0.1"), v("1.0.1")));
        assert!(!should_update(v("1.0.1"), v("1.0.0")), "never downgrade");
    }

    #[test]
    fn hold_pins_or_skips() {
        assert_eq!(Hold::parse("").unwrap(), Hold::None);
        assert_eq!(Hold::parse("1.4.0").unwrap(), Hold::Pin(v("1.4.0")));
        assert_eq!(Hold::parse("pin:1.4.0").unwrap(), Hold::Pin(v("1.4.0")));
        assert_eq!(Hold::parse("skip:1.4.0").unwrap(), Hold::Skip(v("1.4.0")));
        let pin = Hold::Pin(v("1.4.0"));
        assert!(pin.allows(v("1.3.0"), v("1.4.0")));
        assert!(!pin.allows(v("1.3.0"), v("1.5.0")), "pinned: nothing else");
        assert!(!pin.allows(v("1.4.0"), v("1.4.0")), "already there");
        let skip = Hold::Skip(v("1.4.0"));
        assert!(!skip.allows(v("1.3.0"), v("1.4.0")));
        assert!(skip.allows(v("1.3.0"), v("1.4.1")));
    }

    #[test]
    fn manifest_lookup_and_constant_time_match() {
        let m = "abc123  inbox\nDEF456 *other\n";
        assert_eq!(hash_for(m, "inbox").unwrap(), "abc123");
        assert_eq!(
            hash_for(m, "other").unwrap(),
            "def456",
            "binary-mode star and lower-casing"
        );
        assert!(hash_for(m, "missing").is_err());
        assert!(hash_matches("ABC", "abc"));
        assert!(!hash_matches("abc", "abd"));
    }

    #[test]
    fn modes_parse_and_containers_force_off_but_lxc_does_not() {
        assert_eq!(Mode::parse("Supervised").unwrap(), Mode::Supervised);
        assert!(Mode::parse("sometimes").is_err());
        let docker = ContainerEvidence {
            dockerenv: true,
            ..Default::default()
        };
        assert_eq!(effective_mode(Mode::Autonomous, &docker).mode, Mode::Off);
        assert_eq!(
            effective_mode(Mode::Supervised, &docker).mode,
            Mode::Supervised,
            "supervised is the supervisor's call"
        );
        let lxc = ContainerEvidence {
            pid1_cgroup: "0::/lxc/118/init.scope\n".into(),
            ..Default::default()
        };
        assert_eq!(
            effective_mode(Mode::Autonomous, &lxc).mode,
            Mode::Autonomous,
            "an LXC still updates itself (critic #19)"
        );
        let cg_v1 = ContainerEvidence {
            pid1_cgroup: "1:name=systemd:/docker/abc\n".into(),
            ..Default::default()
        };
        assert!(is_managed_image(&cg_v1));
    }

    fn state(attempts: u32) -> UpdateState {
        UpdateState {
            from_version: "1.0.0".into(),
            to_version: "1.1.0".into(),
            previous_binary: "/opt/x/x.prev".into(),
            attempts,
        }
    }

    // Almanac's decision table, plus the two additions.
    #[test]
    fn startup_decision_table() {
        assert_eq!(decide_at_startup(None, "1.1.0", 2), StartAction::Normal);
        // First start of the new version serves (attempt 1 of 2).
        match decide_at_startup(Some(state(0)), "1.1.0", 2) {
            StartAction::Probation(s) => assert_eq!(s.attempts, 1),
            other => panic!("{other:?}"),
        }
        // Second start of the same unproven version reverts.
        assert!(matches!(
            decide_at_startup(Some(state(1)), "1.1.0", 2),
            StartAction::Revert(_)
        ));
        // A larger knob gives more room.
        assert!(matches!(
            decide_at_startup(Some(state(1)), "1.1.0", 3),
            StartAction::Probation(_)
        ));
        // Zero is treated as one: the first start already decides.
        assert!(matches!(
            decide_at_startup(Some(state(0)), "1.1.0", 0),
            StartAction::Revert(_)
        ));
        // The binary running is not the one the state names: stale (critic #20).
        assert!(matches!(
            decide_at_startup(Some(state(0)), "1.0.0", 2),
            StartAction::Stale(_)
        ));
    }

    #[test]
    fn drill_marker_is_version_bound() {
        let m = DrillMarker {
            version: "1.1.0".into(),
            kind: "broken".into(),
        };
        assert_eq!(drill_applies(Some(&m), "1.1.0"), Some("broken"));
        assert_eq!(
            drill_applies(Some(&m), "1.0.0"),
            None,
            "the restored version runs normally"
        );
        assert_eq!(drill_applies(None, "1.1.0"), None);
    }
}
