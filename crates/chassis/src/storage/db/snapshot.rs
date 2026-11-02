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
    prune(path, keep, from)?;
    Ok(dest)
}

/// `<dir>/<stem>.pre-v<version>.db`.
pub(super) fn snapshot_path(path: &Path, version: usize) -> PathBuf {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("db");
    path.with_file_name(format!("{stem}.pre-v{version}.db"))
}

/// The folder of `path`; a bare file name has the empty path as its parent,
/// which means the current directory.
fn folder_of(path: &Path) -> &Path {
    match path.parent() {
        Some(dir) if !dir.as_os_str().is_empty() => dir,
        _ => Path::new("."),
    }
}

/// Delete all but the newest `keep` copies of `path`, newest by version. The
/// copy of version `fresh` was taken a moment ago for the migration that is
/// about to run: it always stays (after a restore of an older backup it can
/// have a lower number than leftovers of the newer line), and the other
/// copies compete for the remaining `keep - 1` places.
/// Every deletion is logged with its count; nothing goes silently.
pub(super) fn prune(path: &Path, keep: usize, fresh: usize) -> Result<(), Error> {
    let dir = folder_of(path);
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
            (version != fresh).then(|| (version, entry.path()))
        })
        .collect();
    let places = keep.saturating_sub(1);
    if copies.len() <= places {
        return Ok(());
    }
    copies.sort_by_key(|(v, _)| *v);
    let removed = copies.len() - places;
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
