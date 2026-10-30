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

mod policy;
#[cfg(test)]
mod tests;
