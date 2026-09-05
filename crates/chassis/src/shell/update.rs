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
use crate::shell::store::write_atomic;
use crate::shell::time::now_rfc3339;

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
pub type StateCopy = Arc<dyn Fn(&Path) -> Result<(), Error> + Send + Sync>;

/// Everything the updater is configured with (AR3 knobs).
#[derive(Clone)]
pub struct UpdateConfig {
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

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn fsync_dir(path: &Path) {
    if let Some(dir) = path.parent()
        && let Ok(d) = std::fs::File::open(dir)
    {
        let _ = d.sync_all();
    }
}

impl Updater {
    pub fn new(
        cfg: UpdateConfig,
        binary: PathBuf,
        state_dir: PathBuf,
        running: Version,
        notify: EventSink,
        state_copy: Option<StateCopy>,
    ) -> Result<Self, Error> {
        let effective = effective_mode(cfg.mode, &container_evidence());
        if !cfg.url.is_empty() && !cfg.url.starts_with("https://") && !cfg.allow_insecure {
            return Err(Error::config(
                format!(
                    "update_url `{}` is not https:// and update_allow_insecure is off",
                    cfg.url
                ),
                "a plain-http release host lets anyone on the path swap VERSION; use https, or set update_allow_insecure=true for a drill server you control",
            ));
        }
        if cfg.pubkey_overridden {
            tracing::warn!(
                "self-update trusts a key from update_pubkey instead of the compiled-in ecosystem key"
            );
        }
        let http = reqwest::Client::builder()
            .timeout(cfg.download_timeout)
            .build()
            .map_err(|e| Error::internal(format!("http client: {e}"), "report this"))?;
        Ok(Self {
            cfg,
            effective,
            http,
            binary,
            state_dir,
            running,
            notify,
            state_copy,
            last: Arc::new(Mutex::new(LastCheck::default())),
        })
    }

    pub fn state_path(&self) -> PathBuf {
        self.state_dir.join("update-state.json")
    }

    fn prev_path(&self) -> PathBuf {
        with_suffix(&self.binary, ".prev")
    }

    fn staging_path(&self) -> PathBuf {
        with_suffix(&self.binary, ".staging")
    }

    fn drill_path(&self) -> PathBuf {
        with_suffix(&self.binary, ".drill")
    }

    /// Versions that were installed and rolled back (CF-3): never retried.
    pub fn skip_path(&self) -> PathBuf {
        self.state_dir.join("update-skip.json")
    }

    fn skipped_versions(&self) -> Vec<String> {
        std::fs::read(self.skip_path())
            .ok()
            .and_then(|b| serde_json::from_slice::<Vec<String>>(&b).ok())
            .unwrap_or_default()
    }

    fn is_skipped(&self, v: Version) -> bool {
        self.skipped_versions().contains(&v.to_string())
    }

    fn remember_skip(&self, version: &str) -> Result<(), Error> {
        let mut v = self.skipped_versions();
        if !v.iter().any(|s| s == version) {
            v.push(version.to_string());
        }
        let bytes = serde_json::to_vec_pretty(&v).expect("skip list serialises");
        write_atomic(&self.skip_path(), &bytes, "update skip list")
    }

    /// What the status card shows (K17).
    pub fn last_check(&self) -> LastCheck {
        self.last.lock().expect("last lock").clone()
    }

    async fn get(&self, name: &str) -> Result<Vec<u8>, Error> {
        let url = format!("{}/{}", self.cfg.url.trim_end_matches('/'), name);
        let res = self.http.get(&url).send().await.map_err(|e| {
            Error::dependency(
                format!("GET {url} failed: {e}"),
                "is the release host reachable from here? check update_url and DNS",
            )
        })?;
        if !res.status().is_success() {
            return Err(Error::dependency(
                format!("GET {url} answered {}", res.status()),
                "the release may be incomplete (assets are uploaded one by one); the next check retries",
            ));
        }
        let too_big = |n: u64| {
            Error::config(
                format!(
                    "{url} is {n} bytes, above update_max_download_bytes ({})",
                    self.cfg.max_download_bytes
                ),
                "nothing was downloaded; raise update_max_download_bytes if the release really is that large",
            )
        };
        if let Some(len) = res.content_length()
            && len > self.cfg.max_download_bytes
        {
            return Err(too_big(len));
        }
        let mut res = res;
        let mut out: Vec<u8> = Vec::new();
        while let Some(chunk) = res.chunk().await.map_err(|e| {
            Error::dependency(format!("reading {url}: {e}"), "the next check retries")
        })? {
            out.extend_from_slice(&chunk);
            if out.len() as u64 > self.cfg.max_download_bytes {
                return Err(too_big(out.len() as u64));
            }
        }
        Ok(out)
    }

    /// `VERSION` on the release host.
    pub async fn latest(&self) -> Result<Version, Error> {
        let text = String::from_utf8(self.get("VERSION").await?).map_err(|_| {
            Error::dependency(
                "VERSION is not text",
                "the release host is serving something else",
            )
        })?;
        Version::parse(&text)
    }

    /// Verify the manifest's signature with the trusted key BEFORE any hash
    /// is trusted (AR8), then bind the signature to the version being
    /// installed (S1): the trusted comment `sign-release.sh` writes reads
    /// `<repo> v<version>`, so a genuine older manifest served under a
    /// newer `VERSION` is refused instead of installed as a downgrade.
    pub fn verify_manifest(
        &self,
        manifest: &[u8],
        signature: &str,
        version: Version,
    ) -> Result<(), Error> {
        let sig = verify_signature(&self.cfg.pubkey, manifest, signature)?;
        let comment = sig.trusted_comment().trim();
        let want_suffix = format!(" v{version}");
        let ok = match &self.cfg.repo {
            Some(repo) => comment == format!("{repo} v{version}"),
            None => comment.ends_with(&want_suffix),
        };
        if !ok {
            return Err(Error::config(
                format!(
                    "the release signature is for `{comment}`, not for {} v{version}",
                    self.cfg.repo.as_deref().unwrap_or("this service")
                ),
                "VERSION and the signed manifest disagree: the host may be replaying an older release under a newer version number; nothing was installed",
            ));
        }
        Ok(())
    }

    /// One check: compare, hold, install. Never restarts; the caller
    /// decides what an `Installed` means in its mode.
    pub async fn check_once(&self) -> Result<Outcome, Error> {
        let result = self.check_inner().await;
        let mut last = self.last.lock().expect("last lock");
        last.at = Some(now_rfc3339());
        match &result {
            Ok(o) => {
                last.error = None;
                last.outcome = Some(format!("{o:?}"));
                last.latest = match o {
                    Outcome::Current { latest } | Outcome::Held { latest } => {
                        Some(latest.to_string())
                    }
                    Outcome::Installed { to, .. } => Some(to.to_string()),
                    Outcome::Blocked { .. } => last.latest.clone(),
                };
            }
            Err(e) => last.error = Some(e.to_string()),
        }
        result
    }

    async fn check_inner(&self) -> Result<Outcome, Error> {
        if let Some(state) = read_state(&self.state_path()) {
            return Ok(Outcome::Blocked {
                pending: state.to_version,
            });
        }
        if self.drill_path().exists() {
            return Ok(Outcome::Blocked {
                pending: "drill marker present".to_string(),
            });
        }
        let latest = self.latest().await?;
        if !should_update(self.running, latest) {
            return Ok(Outcome::Current { latest });
        }
        // CF-3 (live drill 2026-09-05): a version that was installed and
        // rolled back is never retried by this process; otherwise the loop
        // reinstalls it every interval and the service churns through the
        // same crash. A NEWER release clears the way on its own.
        if self.is_skipped(latest) {
            (self.notify)(Event {
                kind: "update.held",
                version: latest.to_string(),
                detail: "rolled back earlier; skipped until a newer release appears".to_string(),
            });
            return Ok(Outcome::Held { latest });
        }
        if !self.cfg.hold.allows(self.running, latest) {
            (self.notify)(Event {
                kind: "update.held",
                version: latest.to_string(),
                detail: format!("{:?} holds it", self.cfg.hold),
            });
            return Ok(Outcome::Held { latest });
        }
        self.install(latest).await?;
        Ok(Outcome::Installed {
            from: self.running,
            to: latest,
        })
    }

    async fn install(&self, version: Version) -> Result<(), Error> {
        let manifest = self.get("SHA256SUMS").await?;
        let signature = String::from_utf8(self.get("SHA256SUMS.minisig").await?).map_err(|_| {
            Error::dependency(
                "SHA256SUMS.minisig is not text",
                "the release host is serving something else",
            )
        })?;
        self.verify_manifest(&manifest, &signature, version)?;
        let manifest_text = String::from_utf8_lossy(&manifest).into_owned();
        let expected = hash_for(&manifest_text, &self.cfg.asset_name)?;

        let binary = self.get(&self.cfg.asset_name).await?;
        let actual = sha256_hex(&binary);
        if !hash_matches(&expected, &actual) {
            return Err(Error::config(
                format!(
                    "the downloaded binary's SHA-256 ({actual}) does not match the signed manifest ({expected})"
                ),
                "nothing was installed; the release host is serving a different file than it signed",
            ));
        }

        let staging = self.staging_path();
        write_executable(&staging, &binary)?;
        if let Err(e) = probe(&staging, self.cfg.probe_timeout).await {
            let _ = std::fs::remove_file(&staging);
            return Err(e);
        }

        if let Some(copy) = &self.state_copy {
            let dest = self.cfg.copies_dir.join(version.to_string());
            std::fs::create_dir_all(&dest).map_err(|e| {
                Error::config(
                    format!(
                        "cannot create the pre-update copy dir {}: {e}",
                        dest.display()
                    ),
                    "make update_copies_dir writable for the service user, or point it elsewhere",
                )
            })?;
            copy(&dest)?;
            prune_copies(&self.cfg.copies_dir, self.cfg.keep_copies);
        }

        // Critic #1: hard-link the old binary aside, then one rename. A
        // `bin` exists at every instant; `bin.prev` is always the old one.
        let prev = self.prev_path();
        let _ = std::fs::remove_file(&prev);
        std::fs::hard_link(&self.binary, &prev).map_err(|e| {
            Error::config(
                format!("cannot keep the previous binary at {}: {e}", prev.display()),
                "the service user needs write access to the directory holding the binary (ReadWritePaths in the unit), not only to the binary",
            )
        })?;
        std::fs::rename(&staging, &self.binary).map_err(|e| {
            let _ = std::fs::remove_file(&prev);
            Error::config(
                format!("cannot install the new binary: {e}"),
                "nothing changed; check the directory's permissions",
            )
        })?;
        fsync_dir(&self.binary);

        if let Some(kind) = &self.cfg.drill {
            let marker = DrillMarker {
                version: version.to_string(),
                kind: kind.clone(),
            };
            let bytes = serde_json::to_vec(&marker).expect("marker serialises");
            write_atomic(&self.drill_path(), &bytes, "drill marker")?;
            tracing::warn!(kind = %kind, %version, "DRILL: the installed version will fail on purpose");
        }

        if self.effective.mode == Mode::Autonomous {
            let state = UpdateState {
                from_version: self.running.to_string(),
                to_version: version.to_string(),
                previous_binary: prev.display().to_string(),
                attempts: 0,
            };
            write_state(&self.state_path(), &state)?;
        }
        (self.notify)(Event {
            kind: "update.installed",
            version: version.to_string(),
            detail: format!(
                "{} → {} ({})",
                self.running,
                version,
                self.effective.mode.label()
            ),
        });
        tracing::info!(from = %self.running, to = %version, mode = self.effective.mode.label(), "update installed");
        Ok(())
    }

    /// At startup, before the stores open (AR15): count the attempt and
    /// revert if the previous start never became healthy. Returns whether
    /// the process should exit (after a revert) so the supervisor starts
    /// the restored binary.
    pub fn handle_pending_update(&self) -> Result<bool, Error> {
        let state = read_state(&self.state_path());
        match decide_at_startup(
            state,
            &self.running.to_string(),
            self.cfg.max_start_attempts,
        ) {
            StartAction::Normal => Ok(false),
            StartAction::Stale(s) => {
                tracing::warn!(pending = %s.to_version, running = %self.running, "update state names another version; clearing it");
                clear_state(&self.state_path());
                Ok(false)
            }
            StartAction::Probation(s) => {
                tracing::info!(to = %s.to_version, attempt = s.attempts, "new version on probation");
                write_state(&self.state_path(), &s)?;
                Ok(false)
            }
            StartAction::Revert(s) => {
                let prev = PathBuf::from(&s.previous_binary);
                let restored = std::fs::rename(&prev, &self.binary);
                clear_state(&self.state_path());
                if let Err(e) = self.remember_skip(&s.to_version) {
                    tracing::error!(error = %e, version = %s.to_version, "cannot record the rolled-back version; it may be retried next interval");
                }
                match restored {
                    Ok(()) => {
                        fsync_dir(&self.binary);
                        tracing::error!(failed = %s.to_version, restored = %s.from_version, "update reverted: the new version never became healthy");
                        (self.notify)(Event {
                            kind: "update.rolled_back",
                            version: s.to_version.clone(),
                            detail: format!(
                                "{} did not come up; reverted to {}",
                                s.to_version, s.from_version
                            ),
                        });
                        Ok(true)
                    }
                    Err(e) => {
                        tracing::error!(error = %e, "revert wanted but the previous binary is gone; running on");
                        (self.notify)(Event {
                            kind: "update.failed",
                            version: s.to_version.clone(),
                            detail: format!("revert impossible: {e}"),
                        });
                        Ok(false)
                    }
                }
            }
        }
    }

    /// The drill (K20, critic #6): only the version the marker names
    /// breaks, and the marker is consumed so the restored version runs.
    pub fn drill_kind(&self) -> Option<String> {
        let path = self.drill_path();
        let marker: Option<DrillMarker> = std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok());
        let kind = drill_applies(marker.as_ref(), &self.running.to_string()).map(|k| k.to_string());
        if kind.is_some() {
            let _ = std::fs::remove_file(&path);
        }
        kind
    }

    /// Called once the service is bound and has served for `healthy_after`
    /// (liveness only, critic #3): the probation is over.
    pub fn confirm_healthy(&self) {
        if read_state(&self.state_path()).is_some() {
            clear_state(&self.state_path());
            tracing::info!(version = %self.running, "update confirmed healthy");
            (self.notify)(Event {
                kind: "update.ok",
                version: self.running.to_string(),
                detail: "new version served past the healthy-after window".to_string(),
            });
        }
    }

    /// One read-only look at the release host (K20): what is the latest
    /// version, is it newer than what runs. Nothing is downloaded or
    /// installed; the status card shows the answer.
    pub async fn watch_once(&self) -> Result<Version, Error> {
        let result = self.latest().await;
        let mut last = self.last.lock().expect("last lock");
        last.at = Some(now_rfc3339());
        match &result {
            Ok(latest) => {
                last.error = None;
                last.latest = Some(latest.to_string());
                last.outcome = Some(if !should_update(self.running, *latest) {
                    "current".to_string()
                } else if self.is_skipped(*latest) {
                    format!(
                        "newer available: {latest}, but it was rolled back earlier and is skipped"
                    )
                } else {
                    format!(
                        "newer available: {latest} (not installed in {} mode)",
                        self.effective.mode.label()
                    )
                });
            }
            Err(e) => last.error = Some(e.to_string()),
        }
        result
    }

    /// The read-only loop for `off` and `supervised` (K20): the card keeps
    /// saying whether a newer release exists, one info line per tick.
    pub async fn run_watch(self: Arc<Self>) {
        tokio::time::sleep(self.cfg.startup_delay).await;
        loop {
            match self.watch_once().await {
                Ok(latest) => {
                    tracing::info!(%latest, running = %self.running, "release check (read-only)")
                }
                Err(e) => {
                    tracing::warn!(error = %e, "release check failed; retrying next interval")
                }
            }
            tokio::time::sleep(self.cfg.interval).await;
        }
    }

    /// The autonomous loop (AR8): first tick after `startup_delay`, then
    /// every `interval`; one info line per tick (rule 23). Returns when an
    /// update was installed, so the caller can exit for the restart.
    pub async fn run_autonomous(self: Arc<Self>) {
        tokio::time::sleep(self.cfg.startup_delay).await;
        loop {
            match self.check_once().await {
                Ok(Outcome::Installed { from, to }) => {
                    tracing::info!(%from, %to, "update installed; exiting 0 so the supervisor restarts the new binary");
                    return;
                }
                Ok(o) => tracing::info!(outcome = ?o, "update check"),
                Err(e) => tracing::warn!(error = %e, "update check failed; retrying next interval"),
            }
            tokio::time::sleep(self.cfg.interval).await;
        }
    }
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

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "binary".to_string());
    name.push_str(suffix);
    path.with_file_name(name)
}

fn write_executable(path: &Path, bytes: &[u8]) -> Result<(), Error> {
    write_atomic(path, bytes, "staged binary")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).map_err(|e| {
            Error::config(
                format!("cannot mark {} executable: {e}", path.display()),
                "check the directory's permissions",
            )
        })?;
    }
    Ok(())
}

/// `<staging> --check`, bounded. A binary that hangs is killed.
async fn probe(binary: &Path, timeout: Duration) -> Result<(), Error> {
    let child = tokio::process::Command::new(binary)
        .arg("--check")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| {
            Error::config(
                format!("cannot run the staged binary: {e}"),
                "nothing was installed",
            )
        })?;
    match tokio::time::timeout(timeout, child.wait_with_output()).await {
        Ok(Ok(out)) if out.status.success() => Ok(()),
        Ok(Ok(out)) => Err(Error::config(
            format!(
                "the new version refuses its own --check: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ),
            "nothing was installed; the release cannot run with this configuration",
        )),
        Ok(Err(e)) => Err(Error::config(
            format!("probing the staged binary failed: {e}"),
            "nothing was installed",
        )),
        Err(_) => Err(Error::config(
            format!(
                "the staged binary's --check did not finish within {} s",
                timeout.as_secs()
            ),
            "nothing was installed; the release hangs on start",
        )),
    }
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

fn prune_copies(dir: &Path, keep: usize) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut dirs: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let md = e.metadata().ok()?;
            if !md.is_dir() {
                return None;
            }
            Some((md.modified().ok()?, e.path()))
        })
        .collect();
    dirs.sort();
    while dirs.len() > keep.max(1) {
        let (_, old) = dirs.remove(0);
        let _ = std::fs::remove_dir_all(old);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Router;
    use axum::routing::get;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// A signed fake release, served in-process.
    struct FakeRelease {
        pub url: String,
        pub pubkey: String,
        pub version_dir: tempfile::TempDir,
        /// GET /VERSION count: the loop tests read the tick schedule from it.
        pub version_hits: Arc<AtomicUsize>,
        _task: tokio::task::JoinHandle<()>,
    }

    const TEST_REPO: &str = "kennypassenier/svc";

    async fn fake_release(version: &str, binary: &[u8], asset: &str) -> FakeRelease {
        fake_release_signed_as(version, binary, asset, &format!("{TEST_REPO} v{version}")).await
    }

    /// A release whose trusted comment is `comment` (S1 tests a wrong one).
    async fn fake_release_signed_as(
        version: &str,
        binary: &[u8],
        asset: &str,
        comment: &str,
    ) -> FakeRelease {
        let dir = tempfile::tempdir().unwrap();
        let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        let manifest = format!("{}  {}\n", sha256_hex(binary), asset);
        let sig = minisign::sign(
            Some(&kp.pk),
            &kp.sk,
            manifest.as_bytes(),
            Some(comment),
            None,
        )
        .unwrap();
        std::fs::write(dir.path().join("VERSION"), version).unwrap();
        std::fs::write(dir.path().join("SHA256SUMS"), &manifest).unwrap();
        std::fs::write(dir.path().join("SHA256SUMS.minisig"), sig.into_string()).unwrap();
        std::fs::write(dir.path().join(asset), binary).unwrap();
        let root = dir.path().to_path_buf();
        let version_hits = Arc::new(AtomicUsize::new(0));
        let hits = version_hits.clone();
        let app = Router::new().route(
            "/{name}",
            get(
                move |axum::extract::Path(name): axum::extract::Path<String>| {
                    let root = root.clone();
                    let hits = hits.clone();
                    async move {
                        if name == "VERSION" {
                            hits.fetch_add(1, Ordering::SeqCst);
                        }
                        match std::fs::read(root.join(&name)) {
                            Ok(b) => (axum::http::StatusCode::OK, b),
                            Err(_) => (axum::http::StatusCode::NOT_FOUND, Vec::new()),
                        }
                    }
                },
            ),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        FakeRelease {
            url: format!("http://{addr}"),
            pubkey: kp.pk.to_base64(),
            version_dir: dir,
            version_hits,
            _task: task,
        }
    }

    /// A "binary" that passes --check: a shell script exiting 0.
    const GOOD_BINARY: &[u8] = b"#!/bin/sh\nexit 0\n";
    const BAD_BINARY: &[u8] = b"#!/bin/sh\necho 'config broken. What now: fix it' >&2\nexit 1\n";

    fn cfg(release: &FakeRelease, mode: Mode, copies_dir: PathBuf) -> UpdateConfig {
        UpdateConfig {
            mode,
            url: release.url.clone(),
            asset_name: "svc".into(),
            interval: Duration::from_secs(3600),
            startup_delay: Duration::from_millis(1),
            healthy_after: Duration::from_millis(1),
            max_start_attempts: 2,
            hold: Hold::None,
            drill: None,
            keep_copies: 2,
            probe_timeout: Duration::from_secs(5),
            download_timeout: Duration::from_secs(5),
            pubkey: release.pubkey.clone(),
            pubkey_overridden: false,
            repo: Some(TEST_REPO.to_string()),
            allow_insecure: true,
            max_download_bytes: 64 * 1024 * 1024,
            copies_dir,
        }
    }

    fn sink() -> (EventSink, Arc<Mutex<Vec<Event>>>) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let s2 = seen.clone();
        (Arc::new(move |e| s2.lock().unwrap().push(e)), seen)
    }

    fn installed(dir: &Path, bytes: &[u8]) -> PathBuf {
        let bin = dir.join("bin").join("svc");
        std::fs::create_dir_all(bin.parent().unwrap()).unwrap();
        write_executable(&bin, bytes).unwrap();
        bin
    }

    #[tokio::test]
    async fn supervised_update_swaps_and_a_second_run_touches_nothing() {
        let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
        let dir = tempfile::tempdir().unwrap();
        let bin = installed(dir.path(), b"#!/bin/sh\nexit 0\n# old\n");
        let (sink, events) = sink();
        let copies = Arc::new(AtomicUsize::new(0));
        let c2 = copies.clone();
        let copy: StateCopy = Arc::new(move |dest: &Path| {
            std::fs::write(dest.join("copy.txt"), "state").unwrap();
            c2.fetch_add(1, Ordering::SeqCst);
            Ok(())
        });
        let up = Updater::new(
            cfg(&release, Mode::Supervised, dir.path().join("copies")),
            bin.clone(),
            dir.path().join("state"),
            Version::parse("1.0.0").unwrap(),
            sink,
            Some(copy),
        )
        .unwrap();
        let out = up.check_once().await.unwrap();
        assert_eq!(
            out,
            Outcome::Installed {
                from: Version::parse("1.0.0").unwrap(),
                to: Version::parse("1.1.0").unwrap()
            }
        );
        assert_eq!(
            std::fs::read(&bin).unwrap(),
            GOOD_BINARY,
            "the new binary is in place"
        );
        assert!(
            std::fs::read(with_suffix(&bin, ".prev"))
                .unwrap()
                .ends_with(b"# old\n"),
            "bin.prev is the old one"
        );
        assert!(!with_suffix(&bin, ".staging").exists());
        assert!(!up.state_path().exists(), "supervised writes no state");
        assert_eq!(
            copies.load(Ordering::SeqCst),
            1,
            "state copy taken before the swap (K21)"
        );
        assert!(
            dir.path()
                .join("copies")
                .join("1.1.0")
                .join("copy.txt")
                .exists()
        );
        assert_eq!(events.lock().unwrap()[0].kind, "update.installed");

        // Already current: nothing touched, exit-0 semantics (Outcome::Current).
        let up2 = Updater::new(
            cfg(&release, Mode::Supervised, dir.path().join("copies")),
            bin.clone(),
            dir.path().join("state"),
            Version::parse("1.1.0").unwrap(),
            Arc::new(|_| {}),
            None,
        )
        .unwrap();
        let before = std::fs::metadata(&bin).unwrap().modified().unwrap();
        assert_eq!(
            up2.check_once().await.unwrap(),
            Outcome::Current {
                latest: Version::parse("1.1.0").unwrap()
            }
        );
        assert_eq!(std::fs::metadata(&bin).unwrap().modified().unwrap(), before);
        assert_eq!(up2.last_check().latest.as_deref(), Some("1.1.0"));
        drop(release.version_dir);
    }

    #[tokio::test]
    async fn a_release_that_fails_its_own_check_is_never_installed() {
        let release = fake_release("1.1.0", BAD_BINARY, "svc").await;
        let dir = tempfile::tempdir().unwrap();
        let bin = installed(dir.path(), GOOD_BINARY);
        let up = Updater::new(
            cfg(&release, Mode::Supervised, dir.path().join("c")),
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            Arc::new(|_| {}),
            None,
        )
        .unwrap();
        let err = up.check_once().await.unwrap_err();
        assert!(
            err.message.contains("refuses its own --check"),
            "{}",
            err.message
        );
        assert!(
            err.message.contains("config broken"),
            "the staged binary's stderr is quoted"
        );
        assert_eq!(std::fs::read(&bin).unwrap(), GOOD_BINARY, "untouched");
        assert!(
            !with_suffix(&bin, ".staging").exists(),
            "staging cleaned up"
        );
        assert!(up.last_check().error.is_some());
    }

    #[tokio::test]
    async fn a_bad_signature_is_refused_before_any_hash_and_a_bad_hash_after() {
        let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
        let dir = tempfile::tempdir().unwrap();
        let bin = installed(dir.path(), GOOD_BINARY);
        // Tamper with the manifest: the signature no longer verifies.
        let manifest_path = release.version_dir.path().join("SHA256SUMS");
        let mut m = std::fs::read_to_string(&manifest_path).unwrap();
        m.push_str("deadbeef  extra\n");
        std::fs::write(&manifest_path, m).unwrap();
        let up = Updater::new(
            cfg(&release, Mode::Supervised, dir.path().join("c")),
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            Arc::new(|_| {}),
            None,
        )
        .unwrap();
        let err = up.check_once().await.unwrap_err();
        assert!(
            err.message.contains("signature does not verify"),
            "{}",
            err.message
        );

        // Fresh release, but the served binary differs from the signed one.
        let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
        std::fs::write(
            release.version_dir.path().join("svc"),
            b"#!/bin/sh\nexit 0\n#tampered\n",
        )
        .unwrap();
        let up = Updater::new(
            cfg(&release, Mode::Supervised, dir.path().join("c")),
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            Arc::new(|_| {}),
            None,
        )
        .unwrap();
        let err = up.check_once().await.unwrap_err();
        assert!(err.message.contains("SHA-256"), "{}", err.message);
        assert_eq!(std::fs::read(&bin).unwrap(), GOOD_BINARY);
    }

    #[tokio::test]
    async fn hold_and_pending_state_block_an_install() {
        let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
        let dir = tempfile::tempdir().unwrap();
        let bin = installed(dir.path(), GOOD_BINARY);
        let mut c = cfg(&release, Mode::Autonomous, dir.path().join("c"));
        c.hold = Hold::Skip(Version::parse("1.1.0").unwrap());
        let (sink, events) = sink();
        let up = Updater::new(
            c,
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            sink,
            None,
        )
        .unwrap();
        assert!(matches!(
            up.check_once().await.unwrap(),
            Outcome::Held { .. }
        ));
        assert_eq!(events.lock().unwrap()[0].kind, "update.held");

        // A pending, unproven update blocks the next one (critic #1).
        let up = Updater::new(
            cfg(&release, Mode::Autonomous, dir.path().join("c")),
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            Arc::new(|_| {}),
            None,
        )
        .unwrap();
        std::fs::create_dir_all(dir.path().join("s")).unwrap();
        write_state(
            &up.state_path(),
            &UpdateState {
                from_version: "0.9.0".into(),
                to_version: "1.0.0".into(),
                previous_binary: "x".into(),
                attempts: 1,
            },
        )
        .unwrap();
        assert!(matches!(
            up.check_once().await.unwrap(),
            Outcome::Blocked { .. }
        ));
    }

    #[tokio::test]
    async fn autonomous_writes_state_and_startup_reverts_after_the_attempts() {
        let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
        let dir = tempfile::tempdir().unwrap();
        let old = b"#!/bin/sh\nexit 0\n# old\n";
        let bin = installed(dir.path(), old);
        let (sink, events) = sink();
        let up = Updater::new(
            cfg(&release, Mode::Autonomous, dir.path().join("c")),
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            sink.clone(),
            None,
        )
        .unwrap();
        assert!(matches!(
            up.check_once().await.unwrap(),
            Outcome::Installed { .. }
        ));
        let state =
            read_state(&up.state_path()).expect("autonomous writes state before the restart");
        assert_eq!(state.to_version, "1.1.0");
        assert_eq!(state.attempts, 0);

        // The NEW binary starts: attempt 1 → probation, keeps serving.
        let new = Updater::new(
            cfg(&release, Mode::Autonomous, dir.path().join("c")),
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.1.0").unwrap(),
            sink.clone(),
            None,
        )
        .unwrap();
        assert!(!new.handle_pending_update().unwrap(), "first start serves");
        assert_eq!(read_state(&new.state_path()).unwrap().attempts, 1);
        // It crashes before confirming; the next start reverts.
        assert!(
            new.handle_pending_update().unwrap(),
            "second start reverts and asks to exit"
        );
        assert!(read_state(&new.state_path()).is_none());
        assert_eq!(
            std::fs::read(&bin).unwrap(),
            old,
            "the previous binary is back"
        );
        assert!(
            events
                .lock()
                .unwrap()
                .iter()
                .any(|e| e.kind == "update.rolled_back")
        );

        // The restored old version starts: nothing pending.
        let restored = Updater::new(
            cfg(&release, Mode::Autonomous, dir.path().join("c")),
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            sink,
            None,
        )
        .unwrap();
        assert!(!restored.handle_pending_update().unwrap());
    }

    #[tokio::test]
    async fn confirm_healthy_clears_probation_and_drill_marker_binds_to_the_version() {
        let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
        let dir = tempfile::tempdir().unwrap();
        let bin = installed(dir.path(), GOOD_BINARY);
        let mut c = cfg(&release, Mode::Autonomous, dir.path().join("c"));
        c.drill = Some("broken".into());
        let (sink, events) = sink();
        let up = Updater::new(
            c,
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            sink.clone(),
            None,
        )
        .unwrap();
        up.check_once().await.unwrap();
        // The old version does not see the drill; the new one does, once.
        assert_eq!(up.drill_kind(), None);
        let new = Updater::new(
            cfg(&release, Mode::Autonomous, dir.path().join("c")),
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.1.0").unwrap(),
            sink,
            None,
        )
        .unwrap();
        assert_eq!(new.drill_kind().as_deref(), Some("broken"));
        assert_eq!(new.drill_kind(), None, "consumed");
        // Probation → healthy clears the state and reports.
        new.handle_pending_update().unwrap();
        new.confirm_healthy();
        assert!(read_state(&new.state_path()).is_none());
        assert!(events.lock().unwrap().iter().any(|e| e.kind == "update.ok"));
        // With nothing pending, confirm_healthy stays silent.
        let before = events.lock().unwrap().len();
        new.confirm_healthy();
        assert_eq!(events.lock().unwrap().len(), before);
    }

    /// S1: a genuine signature over an OLDER manifest, served under a newer
    /// VERSION, is refused because the trusted comment names another version.
    #[tokio::test]
    async fn a_signature_for_another_version_or_repo_is_refused() {
        let release =
            fake_release_signed_as("1.1.0", GOOD_BINARY, "svc", &format!("{TEST_REPO} v1.0.5"))
                .await;
        let dir = tempfile::tempdir().unwrap();
        let bin = installed(dir.path(), GOOD_BINARY);
        let up = Updater::new(
            cfg(&release, Mode::Supervised, dir.path().join("c")),
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            Arc::new(|_| {}),
            None,
        )
        .unwrap();
        let err = up.check_once().await.unwrap_err();
        assert!(err.message.contains("v1.0.5"), "{}", err.message);
        assert!(err.remedy.contains("replaying"), "{}", err.remedy);
        assert_eq!(std::fs::read(&bin).unwrap(), GOOD_BINARY, "untouched");

        let release =
            fake_release_signed_as("1.1.0", GOOD_BINARY, "svc", "kennypassenier/other v1.1.0")
                .await;
        let up = Updater::new(
            cfg(&release, Mode::Supervised, dir.path().join("c")),
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            Arc::new(|_| {}),
            None,
        )
        .unwrap();
        let err = up.check_once().await.unwrap_err();
        assert!(
            err.message.contains("kennypassenier/other"),
            "{}",
            err.message
        );
    }

    /// S1: a plain-http release host is refused unless the operator says so.
    #[tokio::test]
    async fn plain_http_needs_allow_insecure() {
        let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
        let dir = tempfile::tempdir().unwrap();
        let bin = installed(dir.path(), GOOD_BINARY);
        let mut c = cfg(&release, Mode::Supervised, dir.path().join("c"));
        c.allow_insecure = false;
        let err = Updater::new(
            c,
            bin,
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            Arc::new(|_| {}),
            None,
        )
        .err()
        .expect("http:// refused");
        assert!(err.message.contains("not https://"), "{}", err.message);
    }

    /// S8: an asset above the cap is refused before it is read in full.
    #[tokio::test]
    async fn an_oversized_asset_is_refused() {
        let big = vec![b'x'; 4096];
        let release = fake_release("1.1.0", &big, "svc").await;
        let dir = tempfile::tempdir().unwrap();
        let bin = installed(dir.path(), GOOD_BINARY);
        let mut c = cfg(&release, Mode::Supervised, dir.path().join("c"));
        c.max_download_bytes = 1024;
        let up = Updater::new(
            c,
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            Arc::new(|_| {}),
            None,
        )
        .unwrap();
        let err = up.check_once().await.unwrap_err();
        assert!(
            err.message.contains("update_max_download_bytes"),
            "{}",
            err.message
        );
        assert_eq!(std::fs::read(&bin).unwrap(), GOOD_BINARY);
    }

    /// CF-3, live drill 2026-09-05 on CT 118: after a rollback the SAME
    /// version must not be installed again by the next check — the churn
    /// was install → crash → revert → install, every twenty seconds.
    #[tokio::test]
    async fn a_rolled_back_version_is_never_reinstalled() {
        let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
        let dir = tempfile::tempdir().unwrap();
        let old = b"#!/bin/sh\nexit 0\n# old\n";
        let bin = installed(dir.path(), old);
        let (sink, events) = sink();
        let mk = |running: &str| {
            Updater::new(
                cfg(&release, Mode::Autonomous, dir.path().join("c")),
                bin.clone(),
                dir.path().join("s"),
                Version::parse(running).unwrap(),
                sink.clone(),
                None,
            )
            .unwrap()
        };
        assert!(matches!(
            mk("1.0.0").check_once().await.unwrap(),
            Outcome::Installed { .. }
        ));
        let new = mk("1.1.0");
        assert!(!new.handle_pending_update().unwrap(), "probation");
        assert!(new.handle_pending_update().unwrap(), "second start reverts");
        assert_eq!(std::fs::read(&bin).unwrap(), old, "1.0.0 is back");
        // The restored 1.0.0 checks again: 1.1.0 is still the latest release.
        let restored = mk("1.0.0");
        assert!(!restored.handle_pending_update().unwrap());
        let out = restored.check_once().await.unwrap();
        assert!(
            matches!(out, Outcome::Held { .. }),
            "skipped, not reinstalled: {out:?}"
        );
        assert_eq!(std::fs::read(&bin).unwrap(), old, "binary untouched");
        assert!(
            events
                .lock()
                .unwrap()
                .iter()
                .any(|e| e.kind == "update.held" && e.detail.contains("rolled back"))
        );
        assert!(restored.watch_once().await.is_ok());
        assert!(restored.last_check().outcome.unwrap().contains("skipped"));
        // A NEWER release (its own signed fake server) is installed normally.
        let newer = fake_release("1.2.0", GOOD_BINARY, "svc").await;
        let up = Updater::new(
            cfg(&newer, Mode::Autonomous, dir.path().join("c")),
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            Arc::new(|_| {}),
            None,
        )
        .unwrap();
        assert!(matches!(
            up.check_once().await.unwrap(),
            Outcome::Installed { .. }
        ));
    }

    /// K18 / Almanac's lesson: the loop's FIRST tick comes after the startup
    /// delay, not after startup delay + interval; later ticks follow the
    /// interval. Paused clock: hours pass in milliseconds.
    #[tokio::test(start_paused = true)]
    async fn autonomous_loop_ticks_after_the_startup_delay_then_every_interval() {
        let release = fake_release("1.0.0", GOOD_BINARY, "svc").await;
        let dir = tempfile::tempdir().unwrap();
        let bin = installed(dir.path(), GOOD_BINARY);
        let mut c = cfg(&release, Mode::Autonomous, dir.path().join("c"));
        c.startup_delay = Duration::from_secs(300);
        c.interval = Duration::from_secs(6 * 3600);
        let up = Arc::new(
            Updater::new(
                c,
                bin,
                dir.path().join("s"),
                Version::parse("1.0.0").unwrap(),
                Arc::new(|_| {}),
                None,
            )
            .unwrap(),
        );
        let hits = release.version_hits.clone();
        let handle = tokio::spawn(up.clone().run_autonomous());
        // Let the loop reach its first sleep, then step just short of the delay.
        tokio::task::yield_now().await;
        tokio::time::advance(Duration::from_secs(299)).await;
        tokio::task::yield_now().await;
        assert_eq!(
            hits.load(Ordering::SeqCst),
            0,
            "no check before the startup delay"
        );
        tokio::time::advance(Duration::from_secs(2)).await;
        for _ in 0..50 {
            if hits.load(Ordering::SeqCst) >= 1 {
                break;
            }
            tokio::task::yield_now().await;
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert_eq!(
            hits.load(Ordering::SeqCst),
            1,
            "first check right after the startup delay"
        );
        tokio::time::advance(Duration::from_secs(6 * 3600 + 1)).await;
        for _ in 0..50 {
            if hits.load(Ordering::SeqCst) >= 2 {
                break;
            }
            tokio::task::yield_now().await;
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert_eq!(
            hits.load(Ordering::SeqCst),
            2,
            "second check one interval later"
        );
        assert!(up.last_check().at.is_some());
        handle.abort();
    }

    /// K20: in `off` and `supervised` the card still learns about a newer
    /// release, read-only.
    #[tokio::test]
    async fn watch_once_reports_a_newer_release_without_installing() {
        let release = fake_release("2.0.0", GOOD_BINARY, "svc").await;
        let dir = tempfile::tempdir().unwrap();
        let bin = installed(dir.path(), GOOD_BINARY);
        let up = Updater::new(
            cfg(&release, Mode::Off, dir.path().join("c")),
            bin.clone(),
            dir.path().join("s"),
            Version::parse("1.0.0").unwrap(),
            Arc::new(|_| {}),
            None,
        )
        .unwrap();
        let latest = up.watch_once().await.unwrap();
        assert_eq!(latest, Version::parse("2.0.0").unwrap());
        let last = up.last_check();
        assert_eq!(last.latest.as_deref(), Some("2.0.0"));
        assert!(
            last.outcome
                .as_deref()
                .unwrap_or("")
                .starts_with("newer available"),
            "{:?}",
            last.outcome
        );
        assert_eq!(
            std::fs::read(&bin).unwrap(),
            GOOD_BINARY,
            "nothing installed"
        );
        assert!(!with_suffix(&bin, ".staging").exists());
    }

    /// Rule 9 / H5: one REAL artefact signed with Kenny's ecosystem key
    /// (Almanac v2.4.0) verifies against the compiled-in `RELEASE_PUBKEY`.
    /// Its trusted comment is minisign's default, not the chassis
    /// `<repo> v<version>` form: pre-chassis releases are therefore refused
    /// by the version binding, which is the intended boundary.
    #[test]
    fn the_compiled_in_key_verifies_a_real_almanac_release() {
        let manifest = include_bytes!("../../tests/fixtures/almanac-v2.4.0/SHA256SUMS");
        let sig = include_str!("../../tests/fixtures/almanac-v2.4.0/SHA256SUMS.minisig");
        let verified =
            verify_signature(RELEASE_PUBKEY, manifest, sig).expect("real signature verifies");
        assert!(
            verified.trusted_comment().contains("file:SHA256SUMS"),
            "{}",
            verified.trusted_comment()
        );
        let mut tampered = manifest.to_vec();
        tampered.push(b'\n');
        assert!(
            verify_signature(RELEASE_PUBKEY, &tampered, sig).is_err(),
            "one byte changed → refused"
        );
    }

    #[test]
    fn corrupt_state_reads_as_none_and_copies_are_pruned() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("update-state.json");
        std::fs::write(&p, b"{not json").unwrap();
        assert!(read_state(&p).is_none());
        for v in ["1.0.0", "1.1.0", "1.2.0"] {
            std::fs::create_dir_all(dir.path().join("copies").join(v)).unwrap();
            std::thread::sleep(Duration::from_millis(20));
        }
        prune_copies(&dir.path().join("copies"), 2);
        assert!(!dir.path().join("copies/1.0.0").exists());
        assert!(dir.path().join("copies/1.2.0").exists());
    }
}
