//! The command-line side. Exit codes (the homelab's contract):
//!
//! - `0`: the files stand still (pause) or the service is back (resume).
//!   stdout's first word says how: `paused <deadline> <mode>`, `stopped
//!   <unit> <deadline>` (the fallback), `not-running <unit>` (nothing to
//!   hold); for resume `resumed`, `started <unit>` or `nothing-paused`.
//! - `3`: the files could not be made to stand still: nobody listens on
//!   the socket and the unit could not be stopped (no systemd, unknown
//!   unit, not root, or `--no-fallback`).
//! - `4`: writes did not drain within [`DRAIN_TIMEOUT`] and `--no-fallback`
//!   was given; nothing is paused.
//! - `1`: anything else, e.g. stopping the unit failed.

mod unit;

use super::*;
use unit::{start_unit, stop_unit};

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
        } => pause(name, *secs, *mode, *fallback, socket, unit).await,
        BackupCmd::Resume { socket, unit } => resume(name, socket, unit).await,
        BackupCmd::Status { socket, unit } => status(name, socket, unit).await,
    }
}

/// The socket to talk to: the one given on the command line, else the
/// default location for `name`.
fn socket_for(name: &str, socket: &Option<PathBuf>) -> PathBuf {
    socket.clone().unwrap_or_else(|| client_socket_path(name))
}

/// `backup-pause`: ask the service; when it cannot pause, fall back to
/// stopping the unit unless `--no-fallback` was given.
async fn pause(
    name: &str,
    secs: u64,
    mode: Mode,
    fallback: bool,
    socket: &Option<PathBuf>,
    unit: &Option<String>,
) -> u8 {
    let unit = unit_name(name, unit);
    let path = socket_for(name, socket);
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
    stop_unit(&unit, secs).await
}

/// `backup-resume`: start a unit this command stopped, else ask the
/// service to end its pause.
async fn resume(name: &str, socket: &Option<PathBuf>, unit: &Option<String>) -> u8 {
    let unit = unit_name(name, unit);
    if marker(&unit).exists() {
        return start_unit(&unit).await;
    }
    let path = socket_for(name, socket);
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

/// `backup-status`: report a stopped unit, else the service's own answer.
async fn status(name: &str, socket: &Option<PathBuf>, unit: &Option<String>) -> u8 {
    let unit = unit_name(name, unit);
    if let Ok(deadline) = std::fs::read_to_string(marker(&unit)) {
        println!("stopped {unit} {}", deadline.trim());
        return 0;
    }
    let path = socket_for(name, socket);
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

fn unit_name(name: &str, unit: &Option<String>) -> String {
    let unit = unit.clone().unwrap_or_else(|| name.to_string());
    if unit.contains('.') {
        unit
    } else {
        format!("{unit}.service")
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
