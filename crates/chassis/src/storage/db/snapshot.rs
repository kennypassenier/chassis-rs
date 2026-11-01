//! The copy taken before a schema migration (`<stem>.pre-v<N>.db`) and the
//! pruning that keeps the newest few. Lifted from kyu's store (2026-11-01)
//! so every project gets it from the kit; kyu sorted the names as text,
//! which puts `pre-v10` before `pre-v9`, so the version is compared as a
//! number here.

use std::path::{Path, PathBuf};

use rusqlite::Connection;

use super::maintenance::vacuum_into_conn;
use crate::core::error::Error;

/// Copy `conn`'s database beside `path` as `<stem>.pre-v<from>.db`, then
/// keep only the newest `keep` copies. A copy already named so (a retried
/// start) is replaced.
pub(super) fn before_migration(
    conn: &Connection,
    path: &Path,
    from: usize,
    keep: usize,
) -> Result<PathBuf, Error> {
    let dest = snapshot_path(path, from);
    if dest.exists() {
        std::fs::remove_file(&dest).map_err(|e| {
            Error::dependency(
                format!("cannot replace the earlier copy {}: {e}", dest.display()),
                "remove it by hand or free space in the state directory; the migration waits for a fresh copy",
            )
        })?;
    }
    let shown = dest.display().to_string();
    vacuum_into_conn(conn, &dest, &shown).map_err(|e| {
        Error::new(
            e.kind,
            format!(
                "no copy before the migration of {}: {}",
                path.display(),
                e.message
            ),
            "free space in the state directory; the kit does not migrate without its way back",
        )
    })?;
    tracing::info!(copy = %shown, from, "copy taken before the migration");
    prune(path, keep)?;
    Ok(dest)
}

/// `<dir>/<stem>.pre-v<version>.db`.
pub(super) fn snapshot_path(path: &Path, version: usize) -> PathBuf {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("db");
    path.with_file_name(format!("{stem}.pre-v{version}.db"))
}

/// Delete all but the newest `keep` copies of `path`, newest by version.
/// Every deletion is logged with its count; nothing goes silently.
fn prune(path: &Path, keep: usize) -> Result<(), Error> {
    let dir = path.parent().unwrap_or(Path::new("."));
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("db");
    let prefix = format!("{stem}.pre-v");
    let entries = std::fs::read_dir(dir).map_err(|e| {
        Error::dependency(
            format!("cannot list {}: {e}", dir.display()),
            "check the state directory's permissions",
        )
    })?;
    let mut copies: Vec<(usize, PathBuf)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let version = name
                .strip_prefix(&prefix)?
                .strip_suffix(".db")?
                .parse()
                .ok()?;
            Some((version, entry.path()))
        })
        .collect();
    if copies.len() <= keep {
        return Ok(());
    }
    copies.sort_by_key(|(v, _)| *v);
    let removed = copies.len() - keep;
    for (_, old) in copies.iter().take(removed) {
        std::fs::remove_file(old).map_err(|e| {
            Error::dependency(
                format!("cannot remove the old copy {}: {e}", old.display()),
                "remove it by hand",
            )
        })?;
    }
    tracing::info!(removed, kept = keep, "pruned old pre-migration copies");
    Ok(())
}
