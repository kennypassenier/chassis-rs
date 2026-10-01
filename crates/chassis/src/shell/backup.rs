//! Backup pause (feat-backup-1): the moment a nightly `tar` needs, when the
//! files under the state root stand still.
//!
//! The homelab archives a native service's data directory while it runs.
//! A write during that read makes `tar` fail with "file changed as we read
//! it" (homelab fix-157, kyu F172), so until now the only remedy was to
//! stop the unit for the length of the backup. This module offers the
//! lighter alternative: the service stays up and keeps answering reads,
//! and only writing waits.
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
//!   ([`crate::App::on_backup_pause`], e.g. a SQLite WAL checkpoint) and
//!   only then answers. The pause ends at `backup-resume`, at the deadline
//!   `--for` set (a dead-man, so a backup that dies never leaves the
//!   service frozen), or at shutdown.
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

/// The socket's file name inside the runtime directory.
pub const SOCKET_NAME: &str = "backup.sock";

#[derive(Debug, Default)]
struct GateState {
    writers: usize,
    paused: bool,
    until: Option<Instant>,
    /// Bumped by every new pause, so a deadline timer of an earlier pause
    /// never ends a later one.
    epoch: u64,
}

static STATE: Mutex<GateState> = Mutex::new(GateState {
    writers: 0,
    paused: false,
    until: None,
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
/// a pause that cannot drain within [`DRAIN_TIMEOUT`] gives up.
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

/// Whether a backup pause is in force right now.
pub fn is_paused() -> bool {
    state().paused
}

/// A project hook run once the writes drained, before the pause is
/// confirmed; an error ends the pause and is reported to the caller.
pub type PauseHook = Arc<dyn Fn() -> Result<(), Error> + Send + Sync>;
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
}

impl Controller {
    pub fn new(pause_hooks: Vec<PauseHook>, resume_hooks: Vec<ResumeHook>) -> Self {
        Controller {
            pause_hooks: Arc::new(pause_hooks),
            resume_hooks: Arc::new(resume_hooks),
            drain: DRAIN_TIMEOUT,
        }
    }

    /// Pause for `length`; returns the deadline as unix seconds. Pausing
    /// while paused keeps the later of the two deadlines.
    pub async fn pause(&self, length: Duration) -> Result<u64, PauseError> {
        if length.is_zero() || length > MAX_PAUSE {
            return Err(PauseError::Invalid(format!(
                "a pause lasts 1 to {} seconds, not {}",
                MAX_PAUSE.as_secs(),
                length.as_secs()
            )));
        }
        let until = Instant::now() + length;
        let epoch = {
            let mut s = state();
            if s.paused {
                let later = s.until.map_or(until, |u| u.max(until));
                s.until = Some(later);
                let epoch = s.epoch;
                drop(s);
                self.arm_deadline(epoch);
                tracing::info!(until = unix_secs(later), "backup pause extended");
                return Ok(unix_secs(later));
            }
            s.paused = true;
            s.until = Some(until);
            s.epoch += 1;
            s.epoch
        };
        let drain = self.drain;
        let drained = tokio::time::timeout(drain, async {
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
                drain.as_secs()
            );
            return Err(PauseError::Busy(busy));
        }
        for hook in self.pause_hooks.iter() {
            let hook = hook.clone();
            let res = tokio::task::spawn_blocking(move || hook())
                .await
                .unwrap_or_else(|e| {
                    Err(Error::internal(
                        format!("the backup pause hook panicked: {e}"),
                        "report this to the project",
                    ))
                });
            if let Err(e) = res {
                self.abort(epoch);
                self.run_resume_hooks().await;
                tracing::warn!("backup pause refused: a pause hook failed: {e}");
                return Err(PauseError::Hook(e.to_string()));
            }
        }
        self.arm_deadline(epoch);
        tracing::info!(
            seconds = length.as_secs(),
            until = unix_secs(until),
            "backup pause: writes held"
        );
        Ok(unix_secs(until))
    }

    /// End the pause, if one is in force; `reason` goes to the log.
    /// Returns whether one was.
    pub async fn resume(&self, reason: &str) -> bool {
        let was = {
            let mut s = state();
            let was = s.paused;
            s.paused = false;
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

    /// `None` when running, else the seconds left.
    pub fn status(&self) -> Option<u64> {
        let s = state();
        if !s.paused {
            return None;
        }
        Some(
            s.until
                .map_or(0, |u| u.saturating_duration_since(Instant::now()).as_secs()),
        )
    }

    fn abort(&self, epoch: u64) -> usize {
        let mut s = state();
        let busy = s.writers;
        if s.epoch == epoch {
            s.paused = false;
            s.until = None;
        }
        drop(s);
        wake_all();
        busy
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
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::{UnixListener, UnixStream};

    pub struct Server {
        path: PathBuf,
        task: tokio::task::JoinHandle<()>,
        controller: Controller,
    }

    impl Server {
        /// Bind and serve. A failure is a warning, never a reason not to
        /// start: the homelab then falls back to stopping the unit.
        pub fn start(path: PathBuf, controller: Controller) -> Option<Server> {
            if let Some(dir) = path.parent()
                && let Err(e) = std::fs::create_dir_all(dir)
            {
                tracing::warn!(
                    path = %path.display(),
                    "backup pause unavailable: cannot create the socket directory: {e}"
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
                        "backup pause unavailable: cannot bind the socket: {e}"
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

    pub(super) async fn answer(line: &str, c: &Controller) -> String {
        let mut words = line.split_whitespace();
        match (words.next(), words.next(), words.next()) {
            (Some("pause"), Some(secs), None) => match secs.parse::<u64>() {
                Ok(secs) => match c.pause(Duration::from_secs(secs)).await {
                    Ok(until) => format!("paused {until}"),
                    Err(PauseError::Busy(n)) => format!("busy {n}"),
                    Err(PauseError::Hook(e)) => format!("error {e}"),
                    Err(PauseError::Invalid(e)) => format!("error {e}"),
                },
                Err(_) => format!("error `{secs}` is not a whole number of seconds"),
            },
            (Some("resume"), None, _) => {
                c.resume("backup-resume").await;
                "resumed".to_string()
            }
            (Some("status"), None, _) => match c.status() {
                Some(left) => format!("paused {left}"),
                None => "running".to_string(),
            },
            _ => format!("error unknown command `{line}`"),
        }
    }

    use tokio::io::AsyncReadExt;
}

/// What the command line asked for.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum BackupCmd {
    Pause { secs: u64, socket: Option<PathBuf> },
    Status { socket: Option<PathBuf> },
    Resume { socket: Option<PathBuf> },
}

/// The command-line side. Exit codes (the homelab's contract):
/// `0` done; `3` no service listening on the socket (not running, or its
/// unit predates `RuntimeDirectory=`); `4` writes did not drain in time,
/// nothing paused; `1` anything else.
pub mod client {
    use super::*;

    pub const EXIT_NO_SOCKET: u8 = 3;
    pub const EXIT_BUSY: u8 = 4;

    /// Run `cmd` against service `name`; prints the answer, returns the
    /// exit code.
    pub async fn run(name: &str, cmd: &BackupCmd) -> u8 {
        let (socket, line) = match cmd {
            BackupCmd::Pause { secs, socket } => (socket, format!("pause {secs}")),
            BackupCmd::Status { socket } => (socket, "status".to_string()),
            BackupCmd::Resume { socket } => (socket, "resume".to_string()),
        };
        let path = socket.clone().unwrap_or_else(|| client_socket_path(name));
        match ask(&path, &line).await {
            Err(Missing(e)) => {
                eprintln!(
                    "no {name} is listening on {}: {e}. What now: if the service runs, its unit lacks RuntimeDirectory={name} (run `chassis sync --write` in the project and redeploy the unit) or it runs a version without the backup pause; stop the unit for the backup instead",
                    path.display()
                );
                EXIT_NO_SOCKET
            }
            Ok(reply) => {
                let reply = reply.trim();
                if reply.starts_with("paused ") || reply == "running" || reply == "resumed" {
                    println!("{reply}");
                    0
                } else if let Some(n) = reply.strip_prefix("busy ") {
                    eprintln!(
                        "{name} still had {n} write(s) in flight after {} s; nothing is paused. What now: retry, or stop the unit for the backup",
                        DRAIN_TIMEOUT.as_secs()
                    );
                    EXIT_BUSY
                } else {
                    eprintln!("{name}: {}", reply.strip_prefix("error ").unwrap_or(reply));
                    1
                }
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

    // The gate is process-wide, so these tests take turns.
    static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    fn controller() -> Controller {
        Controller::new(Vec::new(), Vec::new())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn a_pause_waits_for_the_write_in_flight_and_holds_new_ones() {
        let _serial = SERIAL.lock().await;
        let c = controller();
        let ticket = writing().await;
        let pausing = tokio::spawn({
            let c = c.clone();
            async move { c.pause(Duration::from_secs(60)).await }
        });
        tokio::time::sleep(Duration::from_millis(150)).await;
        assert!(!pausing.is_finished(), "the pause must wait for the ticket");
        drop(ticket);
        assert!(pausing.await.unwrap().is_ok());
        assert!(is_paused());

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
    async fn a_write_that_never_ends_refuses_the_pause_and_releases_the_gate() {
        let _serial = SERIAL.lock().await;
        let mut c = controller();
        c.drain = Duration::from_millis(200);
        let ticket = writing().await;
        match c.pause(Duration::from_secs(60)).await {
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
        c.pause(Duration::from_secs(1)).await.unwrap();
        assert!(c.status().is_some());
        tokio::time::sleep(Duration::from_millis(1500)).await;
        assert!(!is_paused(), "the dead-man ended it");
        assert_eq!(c.status(), None);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn a_failing_pause_hook_refuses_the_pause() {
        let _serial = SERIAL.lock().await;
        let resumed = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let r = resumed.clone();
        let c = Controller::new(
            vec![Arc::new(|| {
                Err(Error::internal("checkpoint failed", "retry"))
            })],
            vec![Arc::new(move || {
                r.store(true, std::sync::atomic::Ordering::SeqCst)
            })],
        );
        match c.pause(Duration::from_secs(60)).await {
            Err(PauseError::Hook(e)) => assert!(e.contains("checkpoint failed"), "{e}"),
            other => panic!("expected Hook, got {other:?}"),
        }
        assert!(!is_paused());
        assert!(resumed.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn the_command_line_pauses_and_resumes_over_the_socket() {
        let _serial = SERIAL.lock().await;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SOCKET_NAME);
        let server = server::Server::start(path.clone(), controller()).expect("bound");
        let socket = Some(path.clone());
        let pause = BackupCmd::Pause {
            secs: 60,
            socket: socket.clone(),
        };
        assert_eq!(client::run("t", &pause).await, 0);
        assert!(is_paused());
        assert_eq!(
            client::run(
                "t",
                &BackupCmd::Status {
                    socket: socket.clone()
                }
            )
            .await,
            0
        );
        assert_eq!(
            client::run(
                "t",
                &BackupCmd::Resume {
                    socket: socket.clone()
                }
            )
            .await,
            0
        );
        assert!(!is_paused());
        // A pause still in force when the service stops is ended first.
        assert_eq!(client::run("t", &pause).await, 0);
        server.stop().await;
        assert!(!is_paused());
        assert!(!path.exists(), "the socket is removed at stop");
        assert_eq!(
            client::run("t", &pause).await,
            client::EXIT_NO_SOCKET,
            "nobody listening"
        );
    }

    #[tokio::test]
    async fn the_protocol_refuses_what_it_does_not_know() {
        let c = controller();
        assert!(server::answer("pause soon", &c).await.starts_with("error"));
        assert!(server::answer("pause 0", &c).await.starts_with("error"));
        assert!(server::answer("pause 99999", &c).await.starts_with("error"));
        assert!(server::answer("dance", &c).await.starts_with("error"));
    }
}
