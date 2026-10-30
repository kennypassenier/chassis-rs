//! Backup pause (feat-backup-1): the moment a nightly `tar` needs, when the
//! files under the state root stand still.
//!
//! The homelab archives a native service's data directory while it runs.
//! A write during that read makes `tar` fail with "file changed as we read
//! it" (homelab fix-157, kyu F172), so until now the only remedy was to
//! stop the unit for the length of the backup. This module offers that and
//! two lighter ways, and picks the lightest one that holds:
//!
//! | Mode | What stands still | What keeps working |
//! |---|---|---|
//! | [`Mode::Writes`] | every write of the state | reads, pages, `/healthz` |
//! | [`Mode::Full`] | every write, and every request but the probes (503 + `Retry-After`) | `/healthz`, `/readyz`, `/metrics` |
//! | unit stop (the fallback) | the whole process | nothing; systemd starts it again |
//!
//! A service declares the least it needs with [`crate::App::backup_mode`];
//! a caller may ask for more with `--mode full`, never for less.
//!
//! How it fits together:
//!
//! - Every write of the kit's own state goes through
//!   [`crate::shell::store::write_atomic`], which holds a [`WriteTicket`]
//!   for the duration. A project's own writes join with [`writing`] (async)
//!   or [`writing_blocking`] around each write or transaction.
//! - `<name> backup-pause --for <secs>` asks the running service, over a
//!   unix socket in its runtime directory, to pause. New tickets wait, the
//!   service waits for the tickets already out to come back (at most
//!   [`DRAIN_TIMEOUT`]), runs the project's pause hooks
//!   ([`crate::App::on_backup_pause`], e.g. a SQLite WAL checkpoint or
//!   stopping a pump) and only then answers.
//! - When the service cannot give the pause — nobody listens on the socket
//!   (an older binary or unit, a hung process), the writes do not drain, a
//!   hook fails — the command stops the systemd unit instead, so the
//!   backup gets still files in every case it can be given them at all.
//! - Every way has a dead-man: the in-process pause ends by itself at the
//!   `--for` deadline, and a stopped unit gets a systemd timer that starts
//!   it again at that deadline. A backup that dies never leaves a service
//!   frozen or down. `backup-resume` ends whichever way was taken.
//!
//! Exit codes of the client side are part of the contract with the
//! homelab: see [`client`].

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::core::error::Error;

pub mod client;
mod controller;
mod gate;
mod layer;
#[cfg(unix)]
pub mod server;
#[cfg(all(test, unix))]
mod tests;

use gate::{
    NOTIFY, held_error, state, try_ticket, wait_for_ticket, wait_off_the_runtime, wake_all,
};
mod metrics;
pub(crate) use layer::full_pause_layer;
pub(crate) use metrics::PauseMetrics;

/// How long a pause waits for the writes already in flight.
pub const DRAIN_TIMEOUT: Duration = Duration::from_secs(30);

/// The longest pause one call may ask for (6 h).
pub const MAX_PAUSE: Duration = Duration::from_secs(6 * 3600);

/// How long one held write waits before it is answered 503 with
/// `Retry-After` instead (the homelab's ask: a client never times out on
/// its own). Applies to the kit's own writes and to [`writing_within`].
pub const HELD_WRITE_LIMIT: Duration = Duration::from_secs(10);

/// The socket's file name inside the runtime directory.
pub const SOCKET_NAME: &str = "backup.sock";

/// How much of the service a pause stops. Ordered: `Full` includes
/// everything `Writes` holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
#[non_exhaustive]
pub enum Mode {
    /// Writes of the state wait; everything else answers.
    #[default]
    Writes,
    /// Writes wait and every request but `/healthz`, `/readyz` and
    /// `/metrics` is answered 503 with `Retry-After`; pause hooks stop the
    /// project's background work.
    Full,
}

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Mode::Writes => "writes",
            Mode::Full => "full",
        }
    }

    pub fn parse(s: &str) -> Option<Mode> {
        match s {
            "writes" => Some(Mode::Writes),
            "full" => Some(Mode::Full),
            _ => None,
        }
    }
}

#[must_use = "the write is only covered while the ticket is held"]
#[derive(Debug)]
pub struct WriteTicket(());

impl Drop for WriteTicket {
    fn drop(&mut self) {
        let mut s = state();
        s.writers = s.writers.saturating_sub(1);
        drop(s);
        wake_all();
    }
}

/// Wait (without blocking a runtime thread) until no backup pause is in
/// force, then return a ticket. Use it around a project's own writes.
pub async fn writing() -> WriteTicket {
    loop {
        let notified = NOTIFY.notified();
        if let Some(ticket) = try_ticket() {
            return ticket;
        }
        // The timeout is a safety net only; resume wakes every waiter.
        let _ = tokio::time::timeout(Duration::from_millis(200), notified).await;
    }
}

/// [`writing`], but give up after `max`: the error is `Overloaded` (503
/// with `Retry-After`), so a request held by a backup gets an answer it can
/// act on instead of hanging. Use it on request paths.
pub async fn writing_within(max: Duration) -> Result<WriteTicket, Error> {
    tokio::time::timeout(max, writing())
        .await
        .map_err(|_| held_error())
}

/// Seconds until the pause in force ends, at least 1; `None` when none.
pub fn seconds_left() -> Option<u64> {
    let s = state();
    s.paused.then(|| {
        s.until
            .map_or(1, |u| u.saturating_duration_since(Instant::now()).as_secs())
            .max(1)
    })
}

/// [`writing_blocking`], bounded like [`writing_within`]; what the kit's
/// own stores use.
pub fn writing_blocking_within(max: Duration) -> Result<WriteTicket, Error> {
    let deadline = Instant::now() + max;
    if let Some(ticket) = try_ticket() {
        return Ok(ticket);
    }
    wait_off_the_runtime(move || wait_for_ticket(Some(deadline))).ok_or_else(held_error)
}

/// What the status page and `/api/kit/status` show about a pause.
#[derive(Debug, Clone, serde::Serialize)]
#[non_exhaustive]
pub struct PauseView {
    pub mode: &'static str,
    /// Unix seconds.
    pub since: u64,
    pub seconds_left: u64,
}

/// The pause in force, if any.
pub fn status_view() -> Option<PauseView> {
    let s = state();
    s.paused.then(|| PauseView {
        mode: if s.full { "full" } else { "writes" },
        since: s.since,
        seconds_left: s
            .until
            .map_or(0, |u| u.saturating_duration_since(Instant::now()).as_secs()),
    })
}

/// [`writing`] for synchronous code. Inside a multi-threaded tokio runtime
/// the wait hands the worker's other tasks to another thread first, so a
/// pause stalls only the writer.
pub fn writing_blocking() -> WriteTicket {
    // The common case: no pause, no runtime dance.
    if let Some(ticket) = try_ticket() {
        return ticket;
    }
    wait_off_the_runtime(|| wait_for_ticket(None))
        .expect("an unbounded wait ends only with a ticket")
}

/// Whether a backup pause of any mode is in force right now.
pub fn is_paused() -> bool {
    state().paused
}

/// Whether a [`Mode::Full`] pause is in force: background work should
/// stand still too.
pub fn is_fully_paused() -> bool {
    let s = state();
    s.paused && s.full
}

/// A project hook run once the writes drained, before the pause is
/// confirmed, with the mode in force (it runs again with `Full` when a
/// writes-only pause is raised to full). An error refuses the pause and
/// the command falls back to stopping the unit.
pub type PauseHook = Arc<dyn Fn(Mode) -> Result<(), Error> + Send + Sync>;
/// A project hook run when a pause ends, whatever ended it.
pub type ResumeHook = Arc<dyn Fn() + Send + Sync>;

/// Why a pause was refused.
#[derive(Debug)]
#[non_exhaustive]
pub enum PauseError {
    /// Writers still held tickets after [`DRAIN_TIMEOUT`]; nothing paused.
    Busy(usize),
    /// A project pause hook failed; nothing paused.
    Hook(String),
    /// `--for` outside 1 s ..= [`MAX_PAUSE`].
    Invalid(String),
}

/// The service side: owns the hooks and runs pause and resume.
#[derive(Clone)]
pub struct Controller {
    pause_hooks: Arc<Vec<PauseHook>>,
    resume_hooks: Arc<Vec<ResumeHook>>,
    drain: Duration,
    floor: Mode,
    paths: Arc<Vec<PathBuf>>,
    /// The epoch of the last pause this controller began, so a shutdown
    /// ends only its own pause, never one another service in the same
    /// process (the kit's tests run many) holds.
    started: Arc<std::sync::atomic::AtomicU64>,
}

/// Where the service listens: `$RUNTIME_DIRECTORY` (systemd's
/// `RuntimeDirectory=<name>`, i.e. `/run/<name>`), else
/// `$XDG_RUNTIME_DIR/<name>`, else the temp directory. Never inside the
/// state root: a socket there would be in the very archive it protects.
pub fn server_socket_path(name: &str) -> PathBuf {
    if let Ok(dirs) = std::env::var("RUNTIME_DIRECTORY")
        && let Some(first) = dirs.split(':').find(|d| !d.is_empty())
    {
        return Path::new(first).join(SOCKET_NAME);
    }
    if let Ok(xdg) = std::env::var("XDG_RUNTIME_DIR")
        && !xdg.is_empty()
    {
        return Path::new(&xdg).join(name).join(SOCKET_NAME);
    }
    std::env::temp_dir().join(format!("{name}-{SOCKET_NAME}"))
}

/// Where the client looks: `/run/<name>/backup.sock` first (the unit's
/// runtime directory, also from `pct exec` without the unit's
/// environment), then the server's own resolution.
pub fn client_socket_path(name: &str) -> PathBuf {
    let run = Path::new("/run").join(name).join(SOCKET_NAME);
    if run.exists() {
        return run;
    }
    server_socket_path(name)
}

/// What the command line asked for.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum BackupCmd {
    Pause {
        secs: u64,
        mode: Mode,
        /// Stop the unit when the service cannot give the pause (default).
        fallback: bool,
        socket: Option<PathBuf>,
        unit: Option<String>,
    },
    Status {
        socket: Option<PathBuf>,
        unit: Option<String>,
    },
    Resume {
        socket: Option<PathBuf>,
        unit: Option<String>,
    },
}
