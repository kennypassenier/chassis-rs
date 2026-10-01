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
use std::sync::{Arc, Condvar, LazyLock, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::core::error::Error;

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

#[derive(Debug)]
struct GateState {
    writers: usize,
    paused: bool,
    full: bool,
    until: Option<Instant>,
    /// Unix seconds the current pause began, for the metric and the
    /// status page.
    since: u64,
    /// Bumped by every new pause, so a deadline timer of an earlier pause
    /// never ends a later one.
    epoch: u64,
}

static STATE: Mutex<GateState> = Mutex::new(GateState {
    writers: 0,
    paused: false,
    full: false,
    until: None,
    since: 0,
    epoch: 0,
});
static CHANGED: Condvar = Condvar::new();
static NOTIFY: LazyLock<tokio::sync::Notify> = LazyLock::new(tokio::sync::Notify::new);

fn state() -> MutexGuard<'static, GateState> {
    STATE.lock().unwrap_or_else(|e| e.into_inner())
}

fn wake_all() {
    CHANGED.notify_all();
    NOTIFY.notify_waiters();
}

/// Proof that a write may happen now; the pause waits until it is dropped.
/// Hold it around one write or one transaction, never across a long wait:
/// a pause that cannot drain within [`DRAIN_TIMEOUT`] falls back to
/// stopping the unit.
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
        {
            let mut s = state();
            if !s.paused {
                s.writers += 1;
                return WriteTicket(());
            }
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

fn held_error() -> Error {
    let left = seconds_left().unwrap_or(1);
    Error::new(
        crate::core::error::Kind::Overloaded,
        "paused for a backup",
        format!("retry after {left} s"),
    )
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
    let wait = move || {
        let mut s = state();
        while s.paused {
            let now = Instant::now();
            if now >= deadline {
                return None;
            }
            s = CHANGED
                .wait_timeout(s, (deadline - now).min(Duration::from_millis(200)))
                .unwrap_or_else(|e| e.into_inner())
                .0;
        }
        s.writers += 1;
        Some(WriteTicket(()))
    };
    {
        let mut s = state();
        if !s.paused {
            s.writers += 1;
            return Ok(WriteTicket(()));
        }
    }
    let got = match tokio::runtime::Handle::try_current() {
        Ok(h) if h.runtime_flavor() == tokio::runtime::RuntimeFlavor::MultiThread => {
            tokio::task::block_in_place(wait)
        }
        _ => wait(),
    };
    got.ok_or_else(held_error)
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

/// `<prefix>_backup_paused` (0/1) and `<prefix>_backup_paused_since_seconds`
/// (unix time, 0 when running) for `/metrics`.
pub(crate) struct PauseMetrics(pub String);

impl crate::shell::metrics::ScrapeSource for PauseMetrics {
    fn scrape(&self) -> String {
        let (paused, since) = {
            let s = state();
            (u8::from(s.paused), if s.paused { s.since } else { 0 })
        };
        let p = &self.0;
        format!(
            "# HELP {p}_backup_paused 1 while a backup pause holds the state's writes.\n# TYPE {p}_backup_paused gauge\n{p}_backup_paused {paused}\n# HELP {p}_backup_paused_since_seconds Unix time the backup pause in force began; 0 when none.\n# TYPE {p}_backup_paused_since_seconds gauge\n{p}_backup_paused_since_seconds {since}\n"
        )
    }
}

/// [`writing`] for synchronous code. Inside a multi-threaded tokio runtime
/// the wait hands the worker's other tasks to another thread first, so a
/// pause stalls only the writer.
pub fn writing_blocking() -> WriteTicket {
    fn wait() -> WriteTicket {
        let mut s = state();
        while s.paused {
            s = CHANGED
                .wait_timeout(s, Duration::from_millis(200))
                .unwrap_or_else(|e| e.into_inner())
                .0;
        }
        s.writers += 1;
        WriteTicket(())
    }
    {
        // The common case: no pause, no runtime dance.
        let mut s = state();
        if !s.paused {
            s.writers += 1;
            return WriteTicket(());
        }
    }
    match tokio::runtime::Handle::try_current() {
        Ok(h) if h.runtime_flavor() == tokio::runtime::RuntimeFlavor::MultiThread => {
            tokio::task::block_in_place(wait)
        }
        _ => wait(),
    }
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
}

impl Controller {
    pub fn new(pause_hooks: Vec<PauseHook>, resume_hooks: Vec<ResumeHook>) -> Self {
        Controller {
            pause_hooks: Arc::new(pause_hooks),
            resume_hooks: Arc::new(resume_hooks),
            drain: DRAIN_TIMEOUT,
            floor: Mode::Writes,
            paths: Arc::new(Vec::new()),
        }
    }

    /// The directories that stand still during a pause (the state root and
    /// any the project added), printed by `backup-pause` one per line so
    /// the backup can check it archives exactly these.
    pub fn with_paths(mut self, paths: Vec<PathBuf>) -> Self {
        self.paths = Arc::new(paths);
        self
    }

    /// The directories a pause holds still.
    pub fn paths(&self) -> &[PathBuf] {
        &self.paths
    }

    /// The least this service needs; a caller asking for less gets this.
    pub fn with_mode(mut self, floor: Mode) -> Self {
        self.floor = floor;
        self
    }

    /// Pause for `length` in at least `asked` (and at least the service's
    /// own mode); returns the deadline as unix seconds and the mode in
    /// force. Pausing while paused keeps the later deadline and the
    /// larger mode.
    pub async fn pause(&self, length: Duration, asked: Mode) -> Result<(u64, Mode), PauseError> {
        if length.is_zero() || length > MAX_PAUSE {
            return Err(PauseError::Invalid(format!(
                "a pause lasts 1 to {} seconds, not {}",
                MAX_PAUSE.as_secs(),
                length.as_secs()
            )));
        }
        let mode = asked.max(self.floor);
        let until = Instant::now() + length;
        enum Start {
            New(u64),
            Extend {
                epoch: u64,
                later: Instant,
                raise: bool,
            },
        }
        let start = {
            let mut s = state();
            if s.paused {
                let later = s.until.map_or(until, |u| u.max(until));
                s.until = Some(later);
                let raise = mode == Mode::Full && !s.full;
                s.full |= raise;
                Start::Extend {
                    epoch: s.epoch,
                    later,
                    raise,
                }
            } else {
                s.paused = true;
                s.full = mode == Mode::Full;
                s.until = Some(until);
                s.since = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_or(0, |d| d.as_secs());
                s.epoch += 1;
                Start::New(s.epoch)
            }
        };
        let epoch = match start {
            Start::New(epoch) => epoch,
            Start::Extend {
                epoch,
                later,
                raise,
            } => {
                // Writes are already held; a raise to full only needs the
                // hooks to stop the background work too.
                if raise && let Err(e) = self.run_pause_hooks(Mode::Full).await {
                    state().full = false;
                    tracing::warn!("backup pause not raised to full: a pause hook failed: {e}");
                    return Err(PauseError::Hook(e));
                }
                self.arm_deadline(epoch);
                let in_force = if state().full {
                    Mode::Full
                } else {
                    Mode::Writes
                };
                tracing::info!(
                    until = unix_secs(later),
                    mode = in_force.as_str(),
                    "backup pause extended"
                );
                return Ok((unix_secs(later), in_force));
            }
        };
        let drained = tokio::time::timeout(self.drain, async {
            loop {
                let notified = NOTIFY.notified();
                if state().writers == 0 {
                    return;
                }
                let _ = tokio::time::timeout(Duration::from_millis(50), notified).await;
            }
        })
        .await;
        if drained.is_err() {
            let busy = self.abort(epoch);
            tracing::warn!(
                writers = busy,
                "backup pause refused: writes still in flight after {} s",
                self.drain.as_secs()
            );
            return Err(PauseError::Busy(busy));
        }
        if let Err(e) = self.run_pause_hooks(mode).await {
            self.abort(epoch);
            self.run_resume_hooks().await;
            tracing::warn!("backup pause refused: a pause hook failed: {e}");
            return Err(PauseError::Hook(e));
        }
        self.arm_deadline(epoch);
        tracing::info!(
            seconds = length.as_secs(),
            until = unix_secs(until),
            mode = mode.as_str(),
            "backup pause: holding"
        );
        Ok((unix_secs(until), mode))
    }

    /// End the pause, if one is in force; `reason` goes to the log.
    /// Returns whether one was.
    pub async fn resume(&self, reason: &str) -> bool {
        let was = {
            let mut s = state();
            let was = s.paused;
            s.paused = false;
            s.full = false;
            s.until = None;
            was
        };
        wake_all();
        if was {
            self.run_resume_hooks().await;
            tracing::info!(reason, "backup pause ended");
        }
        was
    }

    /// `None` when running, else the seconds left and the mode.
    pub fn status(&self) -> Option<(u64, Mode)> {
        let s = state();
        if !s.paused {
            return None;
        }
        let left = s
            .until
            .map_or(0, |u| u.saturating_duration_since(Instant::now()).as_secs());
        Some((left, if s.full { Mode::Full } else { Mode::Writes }))
    }

    fn abort(&self, epoch: u64) -> usize {
        let mut s = state();
        let busy = s.writers;
        if s.epoch == epoch {
            s.paused = false;
            s.full = false;
            s.until = None;
        }
        drop(s);
        wake_all();
        busy
    }

    async fn run_pause_hooks(&self, mode: Mode) -> Result<(), String> {
        for hook in self.pause_hooks.iter() {
            let hook = hook.clone();
            tokio::task::spawn_blocking(move || hook(mode))
                .await
                .unwrap_or_else(|e| {
                    Err(Error::internal(
                        format!("the backup pause hook panicked: {e}"),
                        "report this to the project",
                    ))
                })
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    async fn run_resume_hooks(&self) {
        for hook in self.resume_hooks.iter() {
            let hook = hook.clone();
            let _ = tokio::task::spawn_blocking(move || hook()).await;
        }
    }

    /// One timer per call; each re-reads the deadline, and only ends the
    /// pause it was armed for.
    fn arm_deadline(&self, epoch: u64) {
        let me = self.clone();
        tokio::spawn(async move {
            loop {
                let until = {
                    let s = state();
                    if !s.paused || s.epoch != epoch {
                        return;
                    }
                    s.until
                };
                let Some(until) = until else { return };
                if Instant::now() >= until {
                    let ended = {
                        let s = state();
                        s.paused && s.epoch == epoch
                    };
                    if ended {
                        me.resume("deadline").await;
                    }
                    return;
                }
                tokio::time::sleep_until(until.into()).await;
            }
        });
    }
}

fn unix_secs(at: Instant) -> u64 {
    let ahead = at.saturating_duration_since(Instant::now());
    (SystemTime::now() + ahead)
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

/// The probes a full pause still answers, so the supervisor and the
/// monitor see a paused service as alive.
const PROBES: &[&str] = &["/healthz", "/readyz", "/metrics"];

/// Answer every request but the probes with 503 while a full pause is in
/// force; outside one the layer only reads a flag.
pub(crate) fn full_pause_layer(router: axum::Router) -> axum::Router {
    router.layer(axum::middleware::from_fn(hold_requests))
}

async fn hold_requests(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    let left = {
        let s = state();
        (s.paused && s.full).then(|| {
            s.until
                .map_or(1, |u| u.saturating_duration_since(Instant::now()).as_secs())
                .max(1)
        })
    };
    match left {
        Some(left) if !PROBES.contains(&req.uri().path()) => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            [(axum::http::header::RETRY_AFTER, left.to_string())],
            axum::Json(serde_json::json!({
                "error": "paused for a backup",
                "remedy": format!("retry after {left} s"),
            })),
        )
            .into_response(),
        _ => next.run(req).await,
    }
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

/// The listening side, started by `App::start` and stopped by
/// `Running::stop`.
#[cfg(unix)]
pub mod server {
    use super::*;
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
    use tokio::net::{UnixListener, UnixStream};

    pub struct Server {
        path: PathBuf,
        task: tokio::task::JoinHandle<()>,
        controller: Controller,
    }

    impl Server {
        /// Bind and serve. A failure is a warning, never a reason not to
        /// start: `backup-pause` then falls back to stopping the unit.
        pub fn start(path: PathBuf, controller: Controller) -> Option<Server> {
            if let Some(dir) = path.parent()
                && let Err(e) = std::fs::create_dir_all(dir)
            {
                tracing::warn!(
                    path = %path.display(),
                    "backup pause unavailable (a backup will stop the unit instead): cannot create the socket directory: {e}"
                );
                return None;
            }
            // A socket left by a killed predecessor; a live one would have
            // answered, and two instances on one runtime directory is a
            // unit error the bind would not fix either.
            let _ = std::fs::remove_file(&path);
            let listener = match UnixListener::bind(&path) {
                Ok(l) => l,
                Err(e) => {
                    tracing::warn!(
                        path = %path.display(),
                        "backup pause unavailable (a backup will stop the unit instead): cannot bind the socket: {e}"
                    );
                    return None;
                }
            };
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
            }
            let c = controller.clone();
            let task = tokio::spawn(async move {
                loop {
                    match listener.accept().await {
                        Ok((stream, _)) => {
                            let c = c.clone();
                            tokio::spawn(async move { serve(stream, c).await });
                        }
                        Err(e) => {
                            tracing::warn!("backup pause socket: accept failed: {e}");
                            tokio::time::sleep(Duration::from_millis(200)).await;
                        }
                    }
                }
            });
            tracing::debug!(path = %path.display(), "backup pause socket listening");
            Some(Server {
                path,
                task,
                controller,
            })
        }

        /// End any pause (so the flush hooks can write) and close.
        pub async fn stop(self) {
            self.task.abort();
            self.controller.resume("shutdown").await;
            let _ = std::fs::remove_file(&self.path);
        }
    }

    async fn serve(stream: UnixStream, c: Controller) {
        let (read, mut write) = stream.into_split();
        let mut line = String::new();
        let mut reader = BufReader::new(read).take(256);
        let got = tokio::time::timeout(Duration::from_secs(5), reader.read_line(&mut line)).await;
        let answer = match got {
            Ok(Ok(_)) => answer(line.trim(), &c).await,
            _ => "error no command within 5 s".to_string(),
        };
        let _ = write.write_all(format!("{answer}\n").as_bytes()).await;
        let _ = write.shutdown().await;
    }

    /// The protocol, one line each way:
    /// `pause <secs> [writes|full]` → `paused <unix deadline> <mode>` |
    /// `busy <writers>` | `error <text>`; `resume` → `resumed`;
    /// `status` → `paused <secs left> <mode>` | `running`.
    pub(super) async fn answer(line: &str, c: &Controller) -> String {
        let words: Vec<&str> = line.split_whitespace().collect();
        match words.as_slice() {
            ["pause", secs, rest @ ..] if rest.len() <= 1 => {
                let Ok(secs) = secs.parse::<u64>() else {
                    return format!("error `{secs}` is not a whole number of seconds");
                };
                let mode = match rest.first() {
                    None => Mode::Writes,
                    Some(m) => match Mode::parse(m) {
                        Some(mode) => mode,
                        None => return format!("error unknown mode `{m}`: writes or full"),
                    },
                };
                match c.pause(Duration::from_secs(secs), mode).await {
                    Ok((until, mode)) => {
                        let mut out = format!("paused {until} {}", mode.as_str());
                        for p in c.paths() {
                            out.push('\n');
                            out.push_str(&p.display().to_string());
                        }
                        out
                    }
                    Err(PauseError::Busy(n)) => format!("busy {n}"),
                    Err(PauseError::Hook(e)) => format!("error {e}"),
                    Err(PauseError::Invalid(e)) => format!("error {e}"),
                }
            }
            ["resume"] => {
                c.resume("backup-resume").await;
                "resumed".to_string()
            }
            ["status"] => match c.status() {
                Some((left, mode)) => format!("paused {left} {}", mode.as_str()),
                None => "running".to_string(),
            },
            _ => format!("error unknown command `{line}`"),
        }
    }
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

/// The command-line side. Exit codes (the homelab's contract):
///
/// - `0`: the files stand still (pause) or the service is back (resume).
///   stdout's first word says how: `paused <deadline> <mode>`, `stopped
///   <unit> <deadline>` (the fallback), `not-running <unit>` (nothing to
///   hold); for resume `resumed`, `started <unit>` or `nothing-paused`.
/// - `3`: the files could not be made to stand still: nobody listens on
///   the socket and the unit could not be stopped (no systemd, unknown
///   unit, not root, or `--no-fallback`).
/// - `4`: writes did not drain within [`DRAIN_TIMEOUT`] and `--no-fallback`
///   was given; nothing is paused.
/// - `1`: anything else, e.g. stopping the unit failed.
pub mod client {
    use super::*;

    pub const EXIT_UNAVAILABLE: u8 = 3;
    pub const EXIT_BUSY: u8 = 4;

    /// Where a stopped unit is remembered, so `backup-resume` knows to
    /// start it again. Under /run: gone after a reboot, which started
    /// the unit anyway.
    const MARKER_DIR: &str = "/run/chassis-backup";

    fn marker(unit: &str) -> PathBuf {
        Path::new(MARKER_DIR).join(format!("{unit}.stopped"))
    }

    fn deadman(unit: &str) -> String {
        format!(
            "chassis-backup-deadman-{}",
            unit.trim_end_matches(".service")
        )
    }

    /// Run `cmd` against service `name`; prints the answer, returns the
    /// exit code.
    pub async fn run(name: &str, cmd: &BackupCmd) -> u8 {
        match cmd {
            BackupCmd::Pause {
                secs,
                mode,
                fallback,
                socket,
                unit,
            } => {
                let unit = unit_name(name, unit);
                let path = socket.clone().unwrap_or_else(|| client_socket_path(name));
                let why = match ask(&path, &format!("pause {secs} {}", mode.as_str())).await {
                    Ok(reply) => {
                        let reply = reply.trim();
                        if reply.starts_with("paused ") {
                            println!("{reply}");
                            return 0;
                        }
                        if let Some(n) = reply.strip_prefix("busy ") {
                            if !fallback {
                                eprintln!(
                                    "{name} still had {n} write(s) in flight after {} s; nothing is paused. What now: retry, or run without --no-fallback to stop the unit instead",
                                    DRAIN_TIMEOUT.as_secs()
                                );
                                return EXIT_BUSY;
                            }
                            format!(
                                "{n} write(s) still in flight after {} s",
                                DRAIN_TIMEOUT.as_secs()
                            )
                        } else {
                            reply.strip_prefix("error ").unwrap_or(reply).to_string()
                        }
                    }
                    Err(Missing(e)) => format!("nobody listens on {}: {e}", path.display()),
                };
                if !fallback {
                    eprintln!(
                        "{name} cannot pause: {why}. What now: if the service runs, its unit lacks RuntimeDirectory={name} (run `chassis sync --write` in the project and redeploy the unit) or its binary predates the backup pause; run without --no-fallback to stop the unit instead"
                    );
                    return EXIT_UNAVAILABLE;
                }
                eprintln!("{name} cannot pause in-process ({why}); stopping {unit} instead");
                stop_unit(&unit, *secs).await
            }
            BackupCmd::Resume { socket, unit } => {
                let unit = unit_name(name, unit);
                if marker(&unit).exists() {
                    return start_unit(&unit).await;
                }
                let path = socket.clone().unwrap_or_else(|| client_socket_path(name));
                match ask(&path, "resume").await {
                    Ok(reply) if reply.trim() == "resumed" => {
                        println!("resumed");
                        0
                    }
                    Ok(reply) => {
                        let reply = reply.trim();
                        eprintln!("{name}: {}", reply.strip_prefix("error ").unwrap_or(reply));
                        1
                    }
                    // Not listening and not stopped by us: there is no
                    // pause to end anywhere.
                    Err(_) => {
                        println!("nothing-paused");
                        0
                    }
                }
            }
            BackupCmd::Status { socket, unit } => {
                let unit = unit_name(name, unit);
                if let Ok(deadline) = std::fs::read_to_string(marker(&unit)) {
                    println!("stopped {unit} {}", deadline.trim());
                    return 0;
                }
                let path = socket.clone().unwrap_or_else(|| client_socket_path(name));
                match ask(&path, "status").await {
                    Ok(reply) => {
                        let reply = reply.trim();
                        if reply.starts_with("paused ") || reply == "running" {
                            println!("{reply}");
                            0
                        } else {
                            eprintln!("{name}: {}", reply.strip_prefix("error ").unwrap_or(reply));
                            1
                        }
                    }
                    Err(Missing(e)) => {
                        eprintln!("nobody listens on {}: {e}", path.display());
                        EXIT_UNAVAILABLE
                    }
                }
            }
        }
    }

    fn unit_name(name: &str, unit: &Option<String>) -> String {
        let unit = unit.clone().unwrap_or_else(|| name.to_string());
        if unit.contains('.') {
            unit
        } else {
            format!("{unit}.service")
        }
    }

    async fn systemctl(args: &[&str]) -> Result<std::process::Output, String> {
        tokio::process::Command::new("systemctl")
            .args(args)
            .output()
            .await
            .map_err(|e| format!("cannot run systemctl: {e}"))
    }

    fn text(out: &std::process::Output) -> String {
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    fn err(out: &std::process::Output) -> String {
        String::from_utf8_lossy(&out.stderr).trim().to_string()
    }

    /// The fallback: stop the unit, with a systemd timer that starts it
    /// again at the deadline even if `backup-resume` never comes.
    async fn stop_unit(unit: &str, secs: u64) -> u8 {
        let show = match systemctl(&["show", "--property=LoadState,ActiveState", "--value", unit])
            .await
        {
            Ok(out) if out.status.success() => text(&out),
            Ok(out) => {
                eprintln!(
                    "cannot read {unit} from systemd: {}. What now: stop the service another way for the backup",
                    err(&out)
                );
                return EXIT_UNAVAILABLE;
            }
            Err(e) => {
                eprintln!(
                    "{e}. What now: without systemd the service has to be stopped another way for the backup"
                );
                return EXIT_UNAVAILABLE;
            }
        };
        let mut lines = show.lines();
        let load = lines.next().unwrap_or_default();
        let active = lines.next().unwrap_or_default();
        if load != "loaded" {
            eprintln!(
                "systemd does not know {unit} (LoadState={load}). What now: pass --unit with the unit's real name"
            );
            return EXIT_UNAVAILABLE;
        }
        if matches!(active, "inactive" | "failed") {
            println!("not-running {unit}");
            return 0;
        }
        if let Err(e) = std::fs::create_dir_all(MARKER_DIR) {
            eprintln!(
                "cannot create {MARKER_DIR}: {e}. What now: run backup-pause as root (pct exec does)"
            );
            return EXIT_UNAVAILABLE;
        }
        let deadline = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_secs())
            + secs;
        if let Err(e) = std::fs::write(marker(unit), format!("{deadline}\n")) {
            eprintln!("cannot write the stop marker: {e}. What now: run backup-pause as root");
            return EXIT_UNAVAILABLE;
        }
        // The dead-man first, so a stopped unit always comes back.
        let timer = deadman(unit);
        let _ = systemctl(&["stop", &format!("{timer}.timer")]).await;
        let _ = systemctl(&["reset-failed", &format!("{timer}.service")]).await;
        let armed = tokio::process::Command::new("systemd-run")
            .args([
                &format!("--unit={timer}"),
                &format!("--on-active={secs}s"),
                "--timer-property=AccuracySec=1s",
                "systemctl",
                "start",
                unit,
            ])
            .output()
            .await;
        match armed {
            Ok(out) if out.status.success() => {}
            Ok(out) => {
                let _ = std::fs::remove_file(marker(unit));
                eprintln!(
                    "cannot arm the restart timer for {unit}: {}. Nothing was stopped",
                    err(&out)
                );
                return 1;
            }
            Err(e) => {
                let _ = std::fs::remove_file(marker(unit));
                eprintln!("cannot run systemd-run: {e}. Nothing was stopped");
                return 1;
            }
        }
        match systemctl(&["stop", unit]).await {
            Ok(out) if out.status.success() => {
                println!("stopped {unit} {deadline}");
                0
            }
            Ok(out) => {
                eprintln!("stopping {unit} failed: {}; starting it again", err(&out));
                start_unit(unit).await;
                1
            }
            Err(e) => {
                eprintln!("{e}; starting {unit} again");
                start_unit(unit).await;
                1
            }
        }
    }

    async fn start_unit(unit: &str) -> u8 {
        let timer = deadman(unit);
        let _ = systemctl(&["stop", &format!("{timer}.timer")]).await;
        let res = systemctl(&["start", unit]).await;
        let _ = std::fs::remove_file(marker(unit));
        match res {
            Ok(out) if out.status.success() => {
                println!("started {unit}");
                0
            }
            Ok(out) => {
                eprintln!(
                    "starting {unit} failed: {}. What now: systemctl status {unit}",
                    err(&out)
                );
                1
            }
            Err(e) => {
                eprintln!("{e}. What now: start {unit} by hand");
                1
            }
        }
    }

    struct Missing(String);

    #[cfg(unix)]
    async fn ask(path: &Path, line: &str) -> Result<String, Missing> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let mut stream = tokio::net::UnixStream::connect(path)
            .await
            .map_err(|e| Missing(e.to_string()))?;
        let io = async {
            stream.write_all(format!("{line}\n").as_bytes()).await?;
            let mut reply = String::new();
            stream.take(4096).read_to_string(&mut reply).await?;
            Ok::<_, std::io::Error>(reply)
        };
        // The drain, the hooks and some slack.
        match tokio::time::timeout(DRAIN_TIMEOUT * 4, io).await {
            Ok(Ok(reply)) if !reply.is_empty() => Ok(reply),
            Ok(Ok(_)) => Ok("error the service closed the socket without an answer".into()),
            Ok(Err(e)) => Ok(format!("error {e}")),
            Err(_) => Ok("error no answer within the time limit".into()),
        }
    }

    #[cfg(not(unix))]
    async fn ask(_path: &Path, _line: &str) -> Result<String, Missing> {
        Err(Missing("the backup pause needs unix sockets".into()))
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    // The gate is process-wide, so these tests take turns.
    static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    fn controller() -> Controller {
        Controller::new(Vec::new(), Vec::new())
    }

    const MIN: Duration = Duration::from_secs(60);

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn a_pause_waits_for_the_write_in_flight_and_holds_new_ones() {
        let _serial = SERIAL.lock().await;
        let c = controller();
        let ticket = writing().await;
        let pausing = tokio::spawn({
            let c = c.clone();
            async move { c.pause(MIN, Mode::Writes).await }
        });
        tokio::time::sleep(Duration::from_millis(150)).await;
        assert!(!pausing.is_finished(), "the pause must wait for the ticket");
        drop(ticket);
        assert_eq!(pausing.await.unwrap().unwrap().1, Mode::Writes);
        assert!(is_paused());
        assert!(!is_fully_paused());

        let writer = tokio::spawn(async { writing().await });
        let blocking = tokio::task::spawn_blocking(writing_blocking);
        tokio::time::sleep(Duration::from_millis(150)).await;
        assert!(!writer.is_finished(), "an async write waits while paused");
        assert!(
            !blocking.is_finished(),
            "a blocking write waits while paused"
        );
        assert!(c.resume("test").await);
        drop(writer.await.unwrap());
        drop(blocking.await.unwrap());
        assert!(!c.resume("test").await, "nothing left to resume");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn the_service_raises_the_mode_and_a_caller_can_raise_it_never_lower() {
        let _serial = SERIAL.lock().await;
        let modes = Arc::new(Mutex::new(Vec::new()));
        let seen = modes.clone();
        let hook: PauseHook = Arc::new(move |m| {
            seen.lock().unwrap().push(m);
            Ok(())
        });
        // A service that declares Full gets Full even when Writes is asked.
        let full = Controller::new(vec![hook.clone()], Vec::new()).with_mode(Mode::Full);
        assert_eq!(full.pause(MIN, Mode::Writes).await.unwrap().1, Mode::Full);
        assert!(is_fully_paused());
        full.resume("test").await;
        // A writes-only pause raised to full while in force runs the hooks
        // again with Full; asking Writes afterwards does not lower it.
        let c = Controller::new(vec![hook], Vec::new());
        assert_eq!(c.pause(MIN, Mode::Writes).await.unwrap().1, Mode::Writes);
        assert_eq!(c.pause(MIN, Mode::Full).await.unwrap().1, Mode::Full);
        assert_eq!(c.pause(MIN, Mode::Writes).await.unwrap().1, Mode::Full);
        assert_eq!(c.status().unwrap().1, Mode::Full);
        c.resume("test").await;
        assert!(!is_fully_paused());
        assert_eq!(
            *modes.lock().unwrap(),
            vec![Mode::Full, Mode::Writes, Mode::Full]
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn a_full_pause_answers_503_except_the_probes() {
        use tower::ServiceExt;
        let _serial = SERIAL.lock().await;
        let r = full_pause_layer(
            axum::Router::new()
                .route("/healthz", axum::routing::get(|| async { "alive" }))
                .route("/api/x", axum::routing::get(|| async { "x" })),
        );
        let get = |p: &'static str| {
            let r = r.clone();
            async move {
                r.oneshot(
                    axum::http::Request::get(p)
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap()
            }
        };
        let c = controller();
        c.pause(MIN, Mode::Writes).await.unwrap();
        assert_eq!(
            get("/api/x").await.status(),
            200,
            "writes-only pause serves"
        );
        c.pause(MIN, Mode::Full).await.unwrap();
        let held = get("/api/x").await;
        assert_eq!(held.status(), 503);
        assert!(held.headers().contains_key("retry-after"));
        assert_eq!(get("/healthz").await.status(), 200, "probes still answer");
        c.resume("test").await;
        assert_eq!(get("/api/x").await.status(), 200);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn a_write_that_never_ends_refuses_the_pause_and_releases_the_gate() {
        let _serial = SERIAL.lock().await;
        let mut c = controller();
        c.drain = Duration::from_millis(200);
        let ticket = writing().await;
        match c.pause(MIN, Mode::Writes).await {
            // Other tests in this binary may be writing too.
            Err(PauseError::Busy(n)) => assert!(n >= 1),
            other => panic!("expected Busy, got {other:?}"),
        }
        assert!(!is_paused());
        drop(writing().await); // not held: the refusal let go
        drop(ticket);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn the_deadline_ends_a_pause_nobody_resumed() {
        let _serial = SERIAL.lock().await;
        let c = controller();
        c.pause(Duration::from_secs(1), Mode::Full).await.unwrap();
        assert!(c.status().is_some());
        tokio::time::sleep(Duration::from_millis(1500)).await;
        assert!(!is_paused(), "the dead-man ended it");
        assert!(!is_fully_paused());
        assert_eq!(c.status(), None);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn a_failing_pause_hook_refuses_the_pause() {
        let _serial = SERIAL.lock().await;
        let resumed = Arc::new(AtomicBool::new(false));
        let r = resumed.clone();
        let c = Controller::new(
            vec![Arc::new(|_| {
                Err(Error::internal("checkpoint failed", "retry"))
            })],
            vec![Arc::new(move || r.store(true, Ordering::SeqCst))],
        );
        match c.pause(MIN, Mode::Writes).await {
            Err(PauseError::Hook(e)) => assert!(e.contains("checkpoint failed"), "{e}"),
            other => panic!("expected Hook, got {other:?}"),
        }
        assert!(!is_paused());
        assert!(resumed.load(Ordering::SeqCst));
    }

    fn pause_cmd(socket: &Path, mode: Mode, fallback: bool) -> BackupCmd {
        BackupCmd::Pause {
            secs: 60,
            mode,
            fallback,
            socket: Some(socket.to_path_buf()),
            // A unit no machine has, so a fallback can never touch a real one.
            unit: Some("chassis-test-no-such-unit-7f3a.service".into()),
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn the_command_line_pauses_and_resumes_over_the_socket() {
        let _serial = SERIAL.lock().await;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SOCKET_NAME);
        let server = server::Server::start(path.clone(), controller()).expect("bound");
        let socket = Some(path.clone());
        let unit = Some("chassis-test-no-such-unit-7f3a.service".to_string());
        assert_eq!(
            client::run("t", &pause_cmd(&path, Mode::Full, false)).await,
            0
        );
        assert!(is_fully_paused());
        let status = BackupCmd::Status {
            socket: socket.clone(),
            unit: unit.clone(),
        };
        assert_eq!(client::run("t", &status).await, 0);
        let resume = BackupCmd::Resume {
            socket: socket.clone(),
            unit: unit.clone(),
        };
        assert_eq!(client::run("t", &resume).await, 0);
        assert!(!is_paused());
        // A pause still in force when the service stops is ended first.
        assert_eq!(
            client::run("t", &pause_cmd(&path, Mode::Writes, false)).await,
            0
        );
        server.stop().await;
        assert!(!is_paused());
        assert!(!path.exists(), "the socket is removed at stop");
        assert_eq!(
            client::run("t", &pause_cmd(&path, Mode::Writes, false)).await,
            client::EXIT_UNAVAILABLE,
            "nobody listening and no fallback"
        );
        assert_eq!(
            client::run("t", &resume).await,
            0,
            "nothing to resume is not a failure"
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn without_a_listener_the_fallback_goes_to_systemd_and_never_claims_a_pause() {
        let _serial = SERIAL.lock().await;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SOCKET_NAME);
        // No server: the fallback asks systemd about a unit that does not
        // exist (or finds no systemd at all) and must not report 0.
        assert_eq!(
            client::run("t", &pause_cmd(&path, Mode::Writes, true)).await,
            client::EXIT_UNAVAILABLE
        );
    }

    #[tokio::test]
    async fn the_protocol_refuses_what_it_does_not_know() {
        let c = controller();
        for line in [
            "pause soon",
            "pause 0",
            "pause 99999",
            "pause 60 everything",
            "pause 60 full extra",
            "dance",
        ] {
            assert!(
                server::answer(line, &c).await.starts_with("error"),
                "{line}"
            );
        }
    }
}
