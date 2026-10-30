//! The one-time import of a project's old files into the app database:
//! the hook runs in ONE transaction, its counts are checked, and the old
//! files are renamed `*.migrated` afterwards. Its own module because it
//! runs once per app lifetime and shares nothing with the Storage page.

use std::path::{Path, PathBuf};

use super::{ImportContext, ImportHook};
use crate::core::error::Error;
use crate::storage::db::{Db, meta_get, meta_set};

/// Run the import hook in one transaction. `Ok(true)` when it ran now,
/// `Ok(false)` when the marker said it already had.
pub(super) fn run_import(db: &Db, hook: ImportHook, state_dir: &Path) -> Result<bool, Error> {
    if db.read_blocking(|c| meta_get(c, "import_done"))?.is_some() {
        return Ok(false);
    }
    let ctx = ImportContext {
        state_dir: state_dir.to_path_buf(),
    };
    let report = db.write_blocking(|tx| {
        // Re-check inside the transaction: two starts racing import once.
        if meta_get(tx, "import_done")?.is_some() {
            return Ok(None);
        }
        let report = hook(tx, &ctx)?;
        if let Some(bad) = report.stores.iter().find(|s| s.expected != s.imported) {
            return Err(Error::dependency(
                format!(
                    "the import of `{}` wrote {} row(s) but the old file held {}",
                    bad.name, bad.imported, bad.expected
                ),
                "nothing was imported; fix the import and restart",
            ));
        }
        if report.expected != report.imported {
            return Err(Error::dependency(
                format!(
                    "the import wrote {} row(s) but the old files held {}",
                    report.imported, report.expected
                ),
                "nothing was imported; fix the import and restart",
            ));
        }
        meta_set(tx, "import_done", &crate::shell::time::now_rfc3339())?;
        Ok(Some(report))
    })?;
    let Some(report) = report else {
        return Ok(false);
    };
    rename_migrated(&report.files);
    tracing::info!(
        rows = report.imported,
        files = report.files.len(),
        "one-time import committed"
    );
    Ok(true)
}

/// `x` becomes `x.migrated` (`x.migrated.2` when that exists). A failed
/// rename is a warning only: the marker already stops a second import.
pub(crate) fn rename_migrated(files: &[PathBuf]) {
    for f in files {
        if !f.exists() {
            continue;
        }
        let mut target = PathBuf::from(format!("{}.migrated", f.display()));
        let mut n = 2;
        while target.exists() {
            target = PathBuf::from(format!("{}.migrated.{n}", f.display()));
            n += 1;
        }
        if let Err(e) = std::fs::rename(f, &target) {
            tracing::warn!(file = %f.display(), error = %e, "could not rename an imported file to *.migrated; remove it by hand, it is no longer read");
        }
    }
}
