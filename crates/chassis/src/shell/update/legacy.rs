//! The one-time move of `update-state.json` and `update-skip.json` into the
//! kit database. Its own module because it runs once per install and only
//! reads the old formats; the files are renamed `*.imported` after the
//! commit, mirroring how the kit file takes over the old sealed stores.
//!
//! No marker row guards it: a file that exists is by definition newer than
//! the database about whatever it holds (a pre-database binary restored by a
//! rollback writes it again), so it is read whenever present and renamed
//! away. State replaces the row; skipped versions are added.

use std::path::{Path, PathBuf};

use super::store::{put_skip, put_state};
use crate::core::error::Error;
use crate::core::update::UpdateState;
use crate::storage::Db;

pub(super) const STATE_FILE: &str = "update-state.json";
pub(super) const SKIP_FILE: &str = "update-skip.json";

/// Read what the old files hold into the database in ONE transaction, then
/// rename them. A file that is not valid JSON of the old shape is reported
/// loudly and set aside like the rest (the old reader treated it as empty
/// too), so a corrupt file cannot block every start. A database error rolls
/// everything back, leaves the files alone and is returned: the next start
/// tries again.
pub(super) fn import(db: &Db, state_dir: &Path) -> Result<(), Error> {
    let state_path = state_dir.join(STATE_FILE);
    let skip_path = state_dir.join(SKIP_FILE);
    let state = read_json::<UpdateState>(&state_path)?;
    let skipped = read_json::<Vec<String>>(&skip_path)?;
    if state.is_none() && skipped.is_none() {
        return Ok(());
    }
    db.write_blocking(|tx| {
        if let Some(Some(s)) = &state {
            put_state(tx, s)?;
        }
        for v in skipped.iter().flatten().flatten() {
            put_skip(tx, v)?;
        }
        Ok(())
    })?;
    let mut moved: Vec<PathBuf> = Vec::new();
    for (parsed, path) in [
        (state.is_some(), state_path),
        (skipped.is_some(), skip_path),
    ] {
        if parsed {
            moved.push(path);
        }
    }
    crate::storage::rename_imported(&moved);
    tracing::info!(
        files = moved.len(),
        "update state moved into the kit database; the old files are renamed *.imported"
    );
    Ok(())
}

/// `None`: no such file. `Some(None)`: the file is there but unreadable as
/// the old shape (logged, to be set aside). `Some(Some(v))`: its content.
fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<Option<Option<T>>, Error> {
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => {
            return Err(Error::config(
                format!("cannot read {}: {e}", path.display()),
                "make the file readable for the service user, or move it away; it holds update state from before the database",
            ));
        }
    };
    Ok(Some(match serde_json::from_slice(&bytes) {
        Ok(v) => Some(v),
        Err(e) => {
            tracing::error!(error = %e, path = %path.display(), "old update file is corrupt; setting it aside as *.imported without importing it");
            None
        }
    }))
}
