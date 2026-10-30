//! The listening side of the backup pause, started by `App::start` and
//! stopped by `Running::stop`. Its own module because it is the only part
//! of the pause that owns a unix socket.

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
        self.controller.resume_own("shutdown").await;
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
