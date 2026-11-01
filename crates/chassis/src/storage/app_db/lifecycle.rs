//! Opening an [`AppDb`]: the handle that opens later, the direct opens
//! for tests, and the validation and one-time import that run once the
//! file is migrated. Its own module because opening is the only phase that
//! writes the handle's shared state; every later operation only reads it.

use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};

use super::import::run_import;
use super::{AppDb, AppDbSpec, ImportHook, ImportState, Shared, StorageProblem};
use crate::core::error::Error;
use crate::storage::db::Db;
use crate::storage::kinds::DataKind;

impl AppDb {
    pub(super) fn empty() -> Result<AppDb, Error> {
        Ok(AppDb {
            shared: Arc::new(Shared {
                db: OnceLock::new(),
                kinds: OnceLock::new(),
                import: Mutex::new(ImportState::NotRequested),
                problems: Mutex::new(Vec::new()),
                secret: crate::shell::time::random_hex(32)?,
            }),
        })
    }

    /// A handle that opens later, at [`crate::App::start`]. Using it
    /// before that is an error, not a panic.
    pub(crate) fn unopened() -> Result<AppDb, Error> {
        Self::empty()
    }

    pub(crate) fn install(
        &self,
        path: &Path,
        spec: AppDbSpec,
        kinds: Vec<DataKind>,
    ) -> Result<(), Error> {
        let db = Db::open_with(path, &spec.migrations, &spec.options)?;
        let dir = path.parent().unwrap_or(Path::new(".")).to_path_buf();
        self.finish(db, spec.import, kinds, &dir)
    }

    /// Validate the declared kinds, run the one-time import, and publish
    /// the open database on the handle.
    pub(super) fn finish(
        &self,
        db: Db,
        import: Option<ImportHook>,
        kinds: Vec<DataKind>,
        state_dir: &Path,
    ) -> Result<(), Error> {
        // The kit's preferences table sits beside the app's own schema.
        db.write_blocking(|tx| Ok(tx.execute_batch(crate::storage::prefs::PREFS_DDL)?))?;
        validate_kinds(&db, &kinds)?;
        dry_run_finished_rules(&db, &kinds)?;
        if let Some(hook) = import {
            self.apply_import(&db, hook, state_dir);
        }
        self.shared
            .db
            .set(db)
            .map_err(|_| Error::internal("the app database was opened twice", "report this"))?;
        let _ = self.shared.kinds.set(kinds);
        Ok(())
    }

    /// Run the import and record how it stands. A failure is never an
    /// error of the open: it becomes a problem and the next start retries.
    fn apply_import(&self, db: &Db, hook: ImportHook, state_dir: &Path) {
        match run_import(db, hook, state_dir) {
            Ok(done) => {
                // Ran now, or the marker said it ran at an earlier start.
                let _ran_now = done;
                *self.shared.import.lock().expect("import lock") = ImportState::Done;
            }
            Err(e) => {
                tracing::error!(error = %e, "the one-time import failed and was rolled back; the app keeps its old files and tries again at the next start");
                self.shared
                    .problems
                    .lock()
                    .expect("problems lock")
                    .push(StorageProblem {
                        what: "the one-time import into the app database failed".into(),
                        why: format!(
                            "{}. Nothing was written; the service keeps using its old files",
                            e.message
                        ),
                        remedy: format!("{}; the import is retried at the next start", e.remedy),
                    });
                *self.shared.import.lock().expect("import lock") =
                    ImportState::Failed { why: e.message };
            }
        }
    }

    /// Open `<state dir>/<file>`: migrate, validate the kinds, run the
    /// import once. A failed import is NOT an error here: see
    /// [`AppDb::import_state`].
    pub fn open(path: &Path, spec: AppDbSpec, kinds: Vec<DataKind>) -> Result<AppDb, Error> {
        let handle = Self::empty()?;
        handle.install(path, spec, kinds)?;
        Ok(handle)
    }

    /// In memory, for fast tests of a project's own queries.
    pub fn open_in_memory(spec: AppDbSpec, kinds: Vec<DataKind>) -> Result<AppDb, Error> {
        let handle = Self::empty()?;
        let db = Db::open_in_memory(&spec.migrations)?;
        handle.finish(db, spec.import, kinds, Path::new("."))?;
        Ok(handle)
    }
}

/// Every kind must fit the schema, and no id may be declared twice.
fn validate_kinds(db: &Db, kinds: &[DataKind]) -> Result<(), Error> {
    let mut seen = std::collections::BTreeSet::new();
    db.read_blocking(|c| {
        for k in kinds {
            k.validate(c)?;
            if !seen.insert(k.id().to_string()) {
                return Err(Error::config(
                    format!("storage kind `{}` is declared twice", k.id()),
                    "give each kind its own id",
                ));
            }
        }
        Ok(())
    })
}

/// The finished-rows rules are dry-run on the writer and rolled back.
fn dry_run_finished_rules(db: &Db, kinds: &[DataKind]) -> Result<(), Error> {
    const ROLLBACK: &str = "dry run, rolled back";
    match db.write_blocking(|tx| {
        for k in kinds {
            k.validate_finished(tx)?;
        }
        Err::<(), _>(Error::invalid(ROLLBACK, "none"))
    }) {
        Err(e) if e.message == ROLLBACK => Ok(()),
        Err(e) => Err(e),
        Ok(()) => Ok(()),
    }
}
