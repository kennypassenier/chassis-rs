//! Staging the downloaded binary: writing it executable, probing it with
//! `--check` (retrying the `ETXTBSY` race), and pruning old pre-update state
//! copies. Its own module because it is process and filesystem plumbing the
//! install pipeline calls but does not need to read.

use super::*;

pub(super) fn write_executable(path: &Path, bytes: &[u8]) -> Result<(), Error> {
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

/// `ETXTBSY`: the kernel refuses to execute a file that some process still
/// holds open for writing. Right after `write_executable` that is a race
/// — a sibling thread's fork inherited the descriptor for a moment (seen
/// in the kit's own CI, 2026-09-06), or a scanner has the file open — so
/// the probe retries briefly instead of declaring the release unusable.
pub(super) fn is_text_file_busy(e: &std::io::Error) -> bool {
    e.raw_os_error() == Some(26)
}

/// How long the probe keeps retrying an `ETXTBSY` spawn before giving up.
pub(super) const BUSY_RETRY_ATTEMPTS: u32 = 40;
pub(super) const BUSY_RETRY_DELAY: Duration = Duration::from_millis(50);

/// Runs `spawn` until it succeeds, fails for another reason, or the
/// attempts are used up on `ETXTBSY`.
pub(super) async fn spawn_retrying_busy<T>(
    mut spawn: impl FnMut() -> std::io::Result<T>,
    attempts: u32,
    delay: Duration,
) -> std::io::Result<T> {
    let mut left = attempts;
    loop {
        match spawn() {
            Err(e) if is_text_file_busy(&e) && left > 0 => {
                left -= 1;
                tokio::time::sleep(delay).await;
            }
            other => return other,
        }
    }
}

/// `<staging> --check`, bounded. A binary that hangs is killed.
pub(super) async fn probe(binary: &Path, timeout: Duration) -> Result<(), Error> {
    let child = spawn_retrying_busy(
        || {
            tokio::process::Command::new(binary)
                .arg("--check")
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::piped())
                .kill_on_drop(true)
                .spawn()
        },
        BUSY_RETRY_ATTEMPTS,
        BUSY_RETRY_DELAY,
    )
    .await
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

pub(super) fn prune_copies(dir: &Path, keep: usize) {
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
