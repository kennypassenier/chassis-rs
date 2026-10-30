//! Self-update, the half that touches the world (K18–K21, AR8, AR9).
//!
//! The pipeline, in both active modes: fetch `VERSION` → compare → fetch
//! `SHA256SUMS` and `SHA256SUMS.minisig` → **verify the signature with the
//! compiled-in key before reading a single hash** → fetch the binary to
//! `<bin>.staging` (same filesystem as the binary) → SHA-256 must match the
//! manifest → run `<staging> --check` → let the project copy its state →
//! `link(bin, bin.prev)` then ONE `rename(staging, bin)` (critic #1: a
//! binary exists at every instant) → fsync the directory.
//!
//! - **supervised** (`<name> update`): stops there and exits 0 — also when
//!   already current, without touching anything. Never restarts, never
//!   writes state: the supervisor preserved its own copy and rolls back
//!   from outside (the homelab's contract).
//! - **autonomous**: writes `update-state.json` first, then exits 0 so
//!   `Restart=always` starts the new binary. On start,
//!   `handle_pending_update` runs BEFORE the stores open (critic #2); the
//!   second start of an unproven version restores `bin.prev`. Health for
//!   this decision is liveness only (critic #3): bound, READY sent,
//!   `healthy_after` elapsed.
//!
//! Ported from Almanac's `shell/update.rs`, which drilled this on CT 112.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::core::error::Error;
use crate::core::update::{
    ContainerEvidence, DrillMarker, Effective, Hold, Mode, StartAction, UpdateState, Version,
    decide_at_startup, drill_applies, effective_mode, hash_for, hash_matches, should_update,
};
use crate::shell::install_binary::{install_staged, restore_from, with_suffix};
use crate::shell::release_verify::check_trusted_comment;
use crate::shell::store::write_atomic;
use crate::shell::time::now_rfc3339;

mod check;
mod fetch;
mod install;
mod loops;
mod paths;
mod staging;
#[cfg(test)]
mod tests;

use staging::{probe, prune_copies, write_executable};

/// The ecosystem's minisign public key (Almanac's `RELEASE_PUBKEY`, also
/// one of latch's). Contract value: the only trust anchor the updater
/// uses (AR8, rule 27 exception). Rotating it is a new kit major.
pub const RELEASE_PUBKEY: &str = "RWQWCzzUBquIHGkS3YERMkuqEm4C3vBArnlb9rySbr8z5ytgVYuji3bS";

/// An operational event the updater reports (K22 carries it).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Event {
    /// `update.installed`, `update.ok`, `update.failed`, `update.rolled_back`, `update.held`.
    pub kind: &'static str,
    pub version: String,
    pub detail: String,
}

pub type EventSink = Arc<dyn Fn(Event) + Send + Sync>;
/// A project's listener on the update events (1.3.0): it runs after the
/// kit's own handling (notify or log) and sees every event, whichever loop
/// or subcommand produced it.
pub type UpdateHook = Arc<dyn Fn(&Event) + Send + Sync>;

/// The kit's own sink followed by the project's hook, if any (1.3.0).
pub fn compose_sink(default: EventSink, hook: Option<UpdateHook>) -> EventSink {
    Arc::new(move |event: Event| {
        if let Some(hook) = &hook {
            hook(&event);
        }
        default(event);
    })
}
pub type StateCopy = Arc<dyn Fn(&Path) -> Result<(), Error> + Send + Sync>;

/// "Not now" for the autonomous loop (1.2.0): `Some(reason)` defers a check.
pub type UpdateGate = Arc<dyn Fn() -> Option<String> + Send + Sync>;

/// Everything the updater is configured with (AR3 knobs).
#[derive(Clone)]
pub struct UpdateConfig {
    /// The project's veto on an autonomous check, if it registered one.
    pub gate: Option<UpdateGate>,
    /// `update.failed` on the N-th consecutive failed check (A3, 1.4.0).
    pub notify_after_failures: u32,
    pub mode: Mode,
    /// Base URL holding `VERSION`, `SHA256SUMS`, `SHA256SUMS.minisig` and the binary.
    pub url: String,
    pub asset_name: String,
    pub interval: Duration,
    pub startup_delay: Duration,
    pub healthy_after: Duration,
    pub max_start_attempts: u32,
    pub hold: Hold,
    pub drill: Option<String>,
    pub keep_copies: usize,
    pub probe_timeout: Duration,
    pub download_timeout: Duration,
    /// Base64 minisign public key; `RELEASE_PUBKEY` unless the operator
    /// overrode it with `<P>_UPDATE_PUBKEY` (drills, staging).
    pub pubkey: String,
    /// True when `pubkey` is not the compiled-in key: logged at start and
    /// shown on the update card, so a changed trust root is never silent.
    pub pubkey_overridden: bool,
    /// `owner/name` the release must be signed for (S1): the signature's
    /// trusted comment has to read `<repo> v<version>`. `None` only when
    /// neither `update_url`'s owner nor `AppSpec.repository` is known; the
    /// version half of the comment is required regardless.
    pub repo: Option<String>,
    /// Allow a plain `http://` release host (drill servers on a LAN). Off
    /// by default: a LAN listener could otherwise swap VERSION (S1).
    pub allow_insecure: bool,
    /// Refuse a release asset larger than this before reading it (S8).
    pub max_download_bytes: u64,
    /// Where pre-update state copies go (K21); outside the state root.
    pub copies_dir: PathBuf,
}

/// What one check decided.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    /// Nothing newer than what runs.
    Current { latest: Version },
    /// Newer exists but the hold refuses it.
    Held { latest: Version },
    /// A pending, unproven update blocks a new one (critic #1).
    Blocked { pending: String },
    /// Installed; in autonomous mode the caller restarts.
    Installed { from: Version, to: Version },
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct LastCheck {
    pub at: Option<String>,
    pub latest: Option<String>,
    pub outcome: Option<String>,
    pub error: Option<String>,
    /// Failed checks in a row; drives the A3 threshold.
    pub consecutive_failures: u32,
}

/// The A3 threshold (1.4.0, Almanac's AR24): a failed check is reported
/// once, on the N-th in a row — not every six hours while a release host
/// is down — and recovery is reported once. Pure, so the table is testable.
pub fn failure_transition(before: u32, ok: bool, threshold: u32) -> (u32, Option<&'static str>) {
    let threshold = threshold.max(1);
    if ok {
        (0, (before >= threshold).then_some("update.ok"))
    } else {
        let after = before.saturating_add(1);
        (after, (after == threshold).then_some("update.failed"))
    }
}

pub struct Updater {
    pub cfg: UpdateConfig,
    pub effective: Effective,
    http: reqwest::Client,
    binary: PathBuf,
    state_dir: PathBuf,
    running: Version,
    notify: EventSink,
    state_copy: Option<StateCopy>,
    last: Arc<Mutex<LastCheck>>,
}

/// What the shell can see of a container, read once at startup.
pub fn container_evidence() -> ContainerEvidence {
    ContainerEvidence {
        dockerenv: Path::new("/.dockerenv").exists(),
        containerenv: Path::new("/run/.containerenv").exists(),
        pid1_cgroup: std::fs::read_to_string("/proc/1/cgroup").unwrap_or_default(),
    }
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// Decode and verify a minisign signature over `manifest` with the base64
/// public key; returns the signature so callers can read its trusted
/// comment. Shared by the updater and the rule-9 fixture test.
pub fn verify_signature(
    pubkey: &str,
    manifest: &[u8],
    signature: &str,
) -> Result<minisign_verify::Signature, Error> {
    let key =
        minisign_verify::PublicKey::from_base64(pubkey.lines().last().unwrap_or_default().trim())
            .map_err(|e| {
            Error::config(
                format!("the release public key is not a minisign key: {e}"),
                "RELEASE_PUBKEY (or update_pubkey) must be the base64 line of minisign.pub",
            )
        })?;
    let sig = minisign_verify::Signature::decode(signature).map_err(|e| {
        Error::config(
            format!("the release signature is malformed: {e}"),
            "the release host is serving something that is not a minisign signature; nothing was installed",
        )
    })?;
    key.verify(manifest, &sig, false).map_err(|e| {
        Error::config(
            format!("the release signature does not verify: {e}"),
            "either the release host is compromised or the signing key changed; nothing was installed, and nothing should be installed by hand until you know which",
        )
    })?;
    Ok(sig)
}

pub fn write_state(path: &Path, state: &UpdateState) -> Result<(), Error> {
    let bytes = serde_json::to_vec_pretty(state).expect("state serialises");
    write_atomic(path, &bytes, "update state")
}

/// A corrupt state file reads as "no pending update" with a loud line
/// rather than refusing to start (Almanac's rule).
pub fn read_state(path: &Path) -> Option<UpdateState> {
    let bytes = std::fs::read(path).ok()?;
    match serde_json::from_slice(&bytes) {
        Ok(s) => Some(s),
        Err(e) => {
            tracing::error!(error = %e, path = %path.display(), "update state is corrupt; treating as no pending update");
            None
        }
    }
}

pub fn clear_state(path: &Path) {
    let _ = std::fs::remove_file(path);
}
