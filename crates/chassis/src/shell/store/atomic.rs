//! Atomic, recorded writes: temp + fsync + rename, the state-directory probe
//! and the `/healthz` subsystem fed by the last failed write. Its own module
//! because every sealed store writes through it and nothing else here does.

use std::path::{Path, PathBuf};

use super::StoreSubsystem;
use crate::core::error::Error;

/// The last store write that failed, if the most recent write failed
/// (H11): `/healthz` reports it through `StoreSubsystem`, so a state
/// directory that turned unwritable after start shows as degraded.
/// Failed writes by path. A path leaves the map only when a write to that
/// same path succeeds: a good write elsewhere never heals a store that is
/// still broken (1.5.1 — before, any success cleared the one global slot,
/// which also made the health check race between parallel writers).
static LAST_WRITE_ERROR: std::sync::Mutex<std::collections::BTreeMap<PathBuf, String>> =
    std::sync::Mutex::new(std::collections::BTreeMap::new());

fn record_write(path: &Path, result: &Result<(), Error>) {
    let mut failed = LAST_WRITE_ERROR.lock().expect("write-error lock");
    match result {
        Ok(()) => {
            failed.remove(path);
        }
        Err(e) => {
            failed.insert(path.to_path_buf(), e.to_string());
        }
    }
}

impl crate::shell::health::Subsystem for StoreSubsystem {
    fn name(&self) -> &str {
        "store"
    }
    fn check(&self) -> crate::shell::health::SubsystemStatus {
        let failed = LAST_WRITE_ERROR.lock().expect("write-error lock");
        match failed.iter().next() {
            None => crate::shell::health::SubsystemStatus::ok("writable"),
            Some((_, e)) if failed.len() == 1 => {
                crate::shell::health::SubsystemStatus::failing(format!("last write failed: {e}"))
            }
            Some((_, e)) => crate::shell::health::SubsystemStatus::failing(format!(
                "last write failed: {e} (and {} more path(s))",
                failed.len() - 1
            )),
        }
    }
}

/// Body of [`super::probe_state_dir`].
pub(super) fn probe(dir: &Path, create: bool) -> Result<(), Error> {
    if !dir.exists() {
        if !create {
            return Err(Error::config(
                format!("state directory {} does not exist", dir.display()),
                "create it, make the service user its owner (chown), and make the unit's ReadWritePaths cover it",
            ));
        }
        std::fs::create_dir_all(dir).map_err(|e| {
            Error::config(
                format!("cannot create the state directory {}: {e}", dir.display()),
                "create it by hand and make the service user its owner",
            )
        })?;
    }
    let probe = dir.join(".chassis-probe");
    let res = std::fs::write(&probe, b"").map_err(|e| {
        Error::config(
            format!("the state directory {} is not writable: {e}", dir.display()),
            "make the service user its owner (chown -R <user> <dir>); under systemd also list it in ReadWritePaths; for a docker bind mount chown the host directory",
        )
    });
    let _ = std::fs::remove_file(&probe);
    record_write(&probe, &res);
    res
}

/// Body of [`super::write_atomic`].
pub(super) fn write(path: &Path, bytes: &[u8], what: &str) -> Result<(), Error> {
    // feat-backup-1: a backup pause holds every write of the kit's state,
    // for at most HELD_WRITE_LIMIT; then the write fails with a 503 the
    // caller can retry, instead of hanging.
    let _ticket =
        crate::shell::backup::writing_blocking_within(crate::shell::backup::HELD_WRITE_LIMIT)?;
    let res = write_atomic_inner(path, bytes, what);
    record_write(path, &res);
    res
}

fn write_atomic_inner(path: &Path, bytes: &[u8], what: &str) -> Result<(), Error> {
    use std::io::Write;
    let dir = path.parent().ok_or_else(|| {
        Error::internal(
            format!("{} has no parent directory", path.display()),
            "report this",
        )
    })?;
    std::fs::create_dir_all(dir).map_err(|e| {
        Error::config(
            format!("cannot create {} for {what}: {e}", dir.display()),
            "create the state directory and make the service user its owner",
        )
    })?;
    let tmp = dir.join(format!(
        ".{}.tmp-{}",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("store"),
        std::process::id()
    ));
    let io = |e: std::io::Error| {
        Error::config(
            format!("cannot write {what} to {}: {e}", path.display()),
            "check free space and the state directory's permissions",
        )
    };
    // S8: 0600 regardless of the umask — the content is sealed, but a
    // plaintext neighbour (update-state.json) goes through here too.
    #[cfg(unix)]
    let mut f = {
        use std::os::unix::fs::OpenOptionsExt;
        std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&tmp)
            .map_err(io)?
    };
    #[cfg(not(unix))]
    let mut f = std::fs::File::create(&tmp).map_err(io)?;
    f.write_all(bytes).map_err(io)?;
    f.sync_all().map_err(io)?;
    drop(f);
    std::fs::rename(&tmp, path).map_err(io)?;
    if let Ok(d) = std::fs::File::open(dir) {
        let _ = d.sync_all();
    }
    Ok(())
}
