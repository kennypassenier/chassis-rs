//! The app's database (`<name>.db`): the handle a project reads and writes
//! through, the one-time import of its old files, and the only door the
//! Storage page's cleanup, delete and compact go through.
//!
//! Everything that deletes, vacuums or prunes takes an [`AppDb`]. An
//! `AppDb` cannot be built for the kit's file (`<name>-kit.db`): its
//! constructors open the app's path only, and the kit file is a different
//! type with no such methods (`docs/STORAGE_DESIGN.md`, decision 2).
//!
//! The import hook (decision 5): a project that kept data in JSON files or
//! another store hands [`AppDbSpec::import`] a closure. It runs once, after
//! the migrations, in ONE transaction; an error or a count that does not
//! match rolls everything back, the app keeps running on its old files, a
//! problem is raised and the next start tries again. On success the marker
//! row commits with the data and the old files are renamed `*.migrated`.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use rusqlite::{Connection, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value as Json;

use super::db::{Db, FileSizes, Migration, meta_get, meta_set};
use super::kinds::{DataKind, KindStats, Now, ResolvedSelector, Selector};
use crate::core::error::{Error, Kind};

/// What the import hook may need to know.
#[derive(Debug, Clone)]
pub struct ImportContext {
    /// The state directory the old files live in.
    pub state_dir: PathBuf,
}

/// What an import hook reports back.
#[derive(Debug, Clone, Default)]
pub struct ImportReport {
    /// How many records the old files held.
    pub expected: u64,
    /// How many rows the hook wrote. Must equal `expected`, or the whole
    /// import is rolled back.
    pub imported: u64,
    /// The old files to rename to `<name>.migrated` once the import
    /// committed.
    pub files: Vec<PathBuf>,
}

/// Runs once, in one transaction, when the marker is absent.
pub type ImportHook =
    Box<dyn FnOnce(&Transaction, &ImportContext) -> Result<ImportReport, Error> + Send>;

/// What a project hands [`crate::App::app_db`].
#[derive(Default)]
pub struct AppDbSpec {
    /// The schema as a numbered list; each step atomic, append only.
    pub migrations: Vec<Migration>,
    /// Move the project's old data in, once.
    pub import: Option<ImportHook>,
}

/// How the one-time import stands.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ImportState {
    /// No import hook, or the database is not open yet.
    NotRequested,
    /// Done (now or at an earlier start); the old files are renamed.
    Done,
    /// Failed and rolled back; the project must keep using its old files.
    /// The next start tries again.
    Failed { why: String },
}

/// A condition the status page should show.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageProblem {
    pub what: String,
    pub why: String,
    pub remedy: String,
}

struct Shared {
    db: OnceLock<Db>,
    kinds: OnceLock<Vec<DataKind>>,
    import: Mutex<ImportState>,
    problems: Mutex<Vec<StorageProblem>>,
    /// Signs preview tokens; random per process, so a token never outlives
    /// a restart.
    secret: String,
}

/// The app's database. Cheap to clone; opened at start by
/// [`crate::App::app_db`], or directly with [`AppDb::open`] /
/// [`AppDb::open_in_memory`] in a test.
#[derive(Clone)]
pub struct AppDb {
    shared: Arc<Shared>,
}

impl std::fmt::Debug for AppDb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppDb")
            .field("db", &self.shared.db.get())
            .finish()
    }
}

/// How long a preview token stays valid.
const TOKEN_TTL_SECS: i64 = 15 * 60;

/// A preview, and the token that binds a delete to it.
#[derive(Debug, Clone, Serialize)]
pub struct Preview {
    pub kind: String,
    pub label: String,
    #[serde(flatten)]
    pub stats: KindStats,
    pub samples: Vec<Json>,
    /// What the person types to confirm: the kind's name.
    pub confirm_with: String,
    /// Binds the selector, the instant and the count; the delete needs it.
    pub token: String,
}

/// What a delete did.
#[derive(Debug, Clone, Serialize)]
pub struct Deleted {
    pub kind: String,
    pub deleted: u64,
    pub remaining: u64,
    /// Pages freed in the file, which a compact would hand back.
    pub reclaimable_bytes: u64,
}

#[derive(Serialize, Deserialize)]
struct TokenBody {
    kind: String,
    /// What was asked, to compare with what a delete asks.
    asked: Selector,
    /// The absolute selection that was counted.
    selector: ResolvedSelector,
    rows: u64,
    issued: i64,
}

/// One kind's row on the Storage page.
#[derive(Debug, Clone, Serialize)]
pub struct KindOverview {
    pub id: String,
    pub label: String,
    pub description: String,
    #[serde(flatten)]
    pub stats: KindStats,
    pub filters: Vec<super::kinds::Filter>,
    pub supports_age: bool,
    pub finished_automatically: bool,
}

impl AppDb {
    fn empty() -> Result<AppDb, Error> {
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

    pub(crate) fn install(
        &self,
        path: &Path,
        spec: AppDbSpec,
        kinds: Vec<DataKind>,
    ) -> Result<(), Error> {
        let db = Db::open(path, &spec.migrations)?;
        let dir = path.parent().unwrap_or(Path::new(".")).to_path_buf();
        self.finish(db, spec.import, kinds, &dir)
    }

    fn finish(
        &self,
        db: Db,
        import: Option<ImportHook>,
        kinds: Vec<DataKind>,
        state_dir: &Path,
    ) -> Result<(), Error> {
        let mut seen = std::collections::BTreeSet::new();
        db.read_blocking(|c| {
            for k in &kinds {
                k.validate(c)?;
                if !seen.insert(k.id().to_string()) {
                    return Err(Error::config(
                        format!("storage kind `{}` is declared twice", k.id()),
                        "give each kind its own id",
                    ));
                }
            }
            Ok(())
        })?;
        // The finished-rows rules are dry-run on the writer and rolled back.
        const ROLLBACK: &str = "dry run, rolled back";
        match db.write_blocking(|tx| {
            for k in &kinds {
                k.validate_finished(tx)?;
            }
            Err::<(), _>(Error::invalid(ROLLBACK, "none"))
        }) {
            Err(e) if e.message == ROLLBACK => {}
            Err(e) => return Err(e),
            Ok(()) => {}
        }
        if let Some(hook) = import {
            let outcome = run_import(&db, hook, state_dir);
            match outcome {
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
                            remedy: format!(
                                "{}; the import is retried at the next start",
                                e.remedy
                            ),
                        });
                    *self.shared.import.lock().expect("import lock") =
                        ImportState::Failed { why: e.message };
                }
            }
        }
        self.shared
            .db
            .set(db)
            .map_err(|_| Error::internal("the app database was opened twice", "report this"))?;
        let _ = self.shared.kinds.set(kinds);
        Ok(())
    }

    // ---- handle ----------------------------------------------------------

    /// The open database, or an error before start.
    pub fn db(&self) -> Result<&Db, Error> {
        self.shared.db.get().ok_or_else(|| {
            Error::internal(
                "the app database is not open yet",
                "it opens when the service starts; open it directly with AppDb::open in a test",
            )
        })
    }

    pub fn path(&self) -> Option<&Path> {
        self.shared.db.get().and_then(Db::path)
    }

    pub async fn read<T, F>(&self, f: F) -> Result<T, Error>
    where
        T: Send + 'static,
        F: FnOnce(&Connection) -> Result<T, Error> + Send + 'static,
    {
        self.db()?.read(f).await
    }

    pub async fn write<T, F>(&self, f: F) -> Result<T, Error>
    where
        T: Send + 'static,
        F: FnOnce(&Transaction) -> Result<T, Error> + Send + 'static,
    {
        self.db()?.write(f).await
    }

    pub fn read_blocking<T>(
        &self,
        f: impl FnOnce(&Connection) -> Result<T, Error>,
    ) -> Result<T, Error> {
        self.db()?.read_blocking(f)
    }

    pub fn write_blocking<T>(
        &self,
        f: impl FnOnce(&Transaction) -> Result<T, Error>,
    ) -> Result<T, Error> {
        self.db()?.write_blocking(f)
    }

    /// A consistent copy of the app's file (`VACUUM INTO`).
    pub fn vacuum_into(&self, dest: &Path) -> Result<u64, Error> {
        self.db()?.vacuum_into(dest)
    }

    pub fn sizes(&self) -> Result<FileSizes, Error> {
        self.db()?.sizes()
    }

    /// How the one-time import stands.
    pub fn import_state(&self) -> ImportState {
        self.shared.import.lock().expect("import lock").clone()
    }

    /// Problems found while opening (a failed import, a failed rename).
    pub fn problems(&self) -> Vec<StorageProblem> {
        self.shared.problems.lock().expect("problems lock").clone()
    }

    pub fn kinds(&self) -> &[DataKind] {
        self.shared.kinds.get().map_or(&[], Vec::as_slice)
    }

    fn kind(&self, id: &str) -> Result<&DataKind, Error> {
        self.kinds().iter().find(|k| k.id() == id).ok_or_else(|| {
            Error::new(
                Kind::NotFound,
                format!("there is no kind of data called `{id}`"),
                format!(
                    "use one of: {}",
                    self.kinds()
                        .iter()
                        .map(DataKind::id)
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            )
        })
    }

    // ---- the Storage page's operations -------------------------------------

    /// One row per declared kind: rows, estimated bytes, oldest, newest.
    pub fn overview(&self) -> Result<Vec<KindOverview>, Error> {
        let whole = ResolvedSelector {
            cutoff_secs: None,
            filters: Default::default(),
        };
        self.read_blocking(|c| {
            self.kinds()
                .iter()
                .map(|k| {
                    Ok(KindOverview {
                        id: k.id().into(),
                        label: k.label().into(),
                        description: k.describe().into(),
                        stats: k.stats(c, &whole)?,
                        filters: k.filters().to_vec(),
                        supports_age: k.has_time(),
                        finished_automatically: k.has_finished_rule(),
                    })
                })
                .collect()
        })
    }

    /// Read-only: how many rows, how many bytes, oldest, newest, five
    /// samples, and the token a delete must present.
    pub fn preview(&self, kind: &str, sel: &Selector) -> Result<Preview, Error> {
        self.preview_at(kind, sel, &Now::current())
    }

    pub(crate) fn preview_at(
        &self,
        kind: &str,
        sel: &Selector,
        now: &Now,
    ) -> Result<Preview, Error> {
        let k = self.kind(kind)?;
        let resolved = k.resolve(sel, now)?;
        let (stats, samples) =
            self.read_blocking(|c| Ok((k.stats(c, &resolved)?, k.samples(c, &resolved, 5)?)))?;
        let token = self.sign(&TokenBody {
            kind: kind.into(),
            asked: sel.clone(),
            selector: resolved,
            rows: stats.rows,
            issued: now.secs,
        });
        Ok(Preview {
            kind: kind.into(),
            label: k.label().into(),
            stats,
            samples,
            confirm_with: k.id().into(),
            token,
        })
    }

    /// Delete exactly what the preview showed: the confirmation must be the
    /// kind's name, the token must be ours, fresh and for this kind and
    /// selector, and the rows are recounted inside the transaction. If the
    /// count moved since the preview nothing is deleted.
    pub fn delete(
        &self,
        kind: &str,
        sel: &Selector,
        token: &str,
        confirm: &str,
    ) -> Result<Deleted, Error> {
        self.delete_at(kind, sel, token, confirm, &Now::current())
    }

    pub(crate) fn delete_at(
        &self,
        kind: &str,
        sel: &Selector,
        token: &str,
        confirm: &str,
        now: &Now,
    ) -> Result<Deleted, Error> {
        let k = self.kind(kind)?;
        if confirm != k.id() {
            return Err(Error::invalid(
                format!("the confirmation `{confirm}` is not the kind's name"),
                format!("type `{}` to confirm", k.id()),
            ));
        }
        let body = self.verify(token, now)?;
        // The delete must ask for exactly what was previewed; the age was
        // fixed then as an absolute instant (`body.selector.cutoff_secs`).
        k.resolve(sel, now)?;
        if body.kind != kind || body.asked != *sel {
            return Err(Error::invalid(
                "the delete does not match the preview it carries",
                "preview the selection again and confirm that one",
            ));
        }
        let deleted = self.write_blocking(|tx| {
            let now_rows = k.stats_tx(tx, &body.selector)?.rows;
            if now_rows != body.rows {
                return Err(Error::invalid(
                    format!(
                        "the selection held {} row(s) at the preview and holds {now_rows} now; nothing was deleted",
                        body.rows
                    ),
                    "preview again and confirm the new count",
                ));
            }
            let n = k.delete(tx, &body.selector)?;
            if n != body.rows {
                return Err(Error::internal(
                    format!("the delete removed {n} row(s) but {} were previewed; rolled back", body.rows),
                    "report this",
                ));
            }
            Ok(n)
        })?;
        let remaining = self.read_blocking(|c| {
            k.stats(
                c,
                &ResolvedSelector {
                    cutoff_secs: None,
                    filters: Default::default(),
                },
            )
        })?;
        let sizes = self.sizes()?;
        tracing::info!(
            audit = true,
            kind,
            deleted,
            selector = %serde_json::to_string(&body.selector).unwrap_or_default(),
            remaining = remaining.rows,
            "storage: rows deleted from the Storage page"
        );
        Ok(Deleted {
            kind: kind.into(),
            deleted,
            remaining: remaining.rows,
            reclaimable_bytes: sizes.reclaimable_bytes,
        })
    }

    /// Remove, from every kind that declared a rule, the rows finished by
    /// their own definition. Returns `(kind, removed)` per kind with a rule.
    /// Kinds without a rule, and tables that are no kind, are untouched.
    pub fn prune_finished(&self) -> Result<Vec<(String, u64)>, Error> {
        self.prune_finished_at(&Now::current())
    }

    pub(crate) fn prune_finished_at(&self, now: &Now) -> Result<Vec<(String, u64)>, Error> {
        if !self.kinds().iter().any(DataKind::has_finished_rule) {
            return Ok(Vec::new());
        }
        let out = self.write_blocking(|tx| {
            let mut out = Vec::new();
            for k in self.kinds() {
                if let Some(n) = k.prune_finished(tx, now)? {
                    out.push((k.id().to_string(), n));
                }
            }
            Ok(out)
        })?;
        for (kind, removed) in &out {
            tracing::info!(kind = %kind, removed, "storage: pruned rows finished by their own definition");
        }
        Ok(out)
    }

    /// What a compact would do: the file, the pages it would hand back.
    pub fn compact_preview(&self) -> Result<CompactPreview, Error> {
        let sizes = self.sizes()?;
        Ok(CompactPreview {
            file_bytes: sizes.db_bytes,
            reclaimable_bytes: sizes.reclaimable_bytes,
            // VACUUM writes a full copy first.
            free_space_needed_bytes: sizes.db_bytes.saturating_sub(sizes.reclaimable_bytes),
            paused: crate::shell::backup::is_paused(),
        })
    }

    /// `VACUUM` the app's file. Refused while a backup pause holds the
    /// state: a rewrite of the whole file is exactly what the backup must
    /// not see.
    pub fn compact(&self) -> Result<CompactPreview, Error> {
        if crate::shell::backup::is_paused() {
            return Err(Error::new(
                Kind::Overloaded,
                "paused for a backup",
                format!(
                    "retry after {} s",
                    crate::shell::backup::seconds_left().unwrap_or(1)
                ),
            ));
        }
        let before = self.compact_preview()?;
        self.db()?.vacuum_blocking()?;
        tracing::info!(
            audit = true,
            reclaimed = before.reclaimable_bytes,
            "storage: app database compacted from the Storage page"
        );
        self.compact_preview()
    }

    // ---- tokens ---------------------------------------------------------

    fn sign(&self, body: &TokenBody) -> String {
        let payload = serde_json::to_vec(body).expect("token serialises");
        let b64 = hex::encode(&payload);
        let mac =
            crate::core::crypto::sha256_hex(format!("{}.{b64}", self.shared.secret).as_bytes());
        format!("{b64}.{mac}")
    }

    fn verify(&self, token: &str, now: &Now) -> Result<TokenBody, Error> {
        let bad = || {
            Error::invalid(
                "the preview token is not valid",
                "preview the selection again; a token does not survive a restart",
            )
        };
        let (b64, mac) = token.split_once('.').ok_or_else(bad)?;
        let want =
            crate::core::crypto::sha256_hex(format!("{}.{b64}", self.shared.secret).as_bytes());
        if !crate::core::crypto::ct_eq(want.as_bytes(), mac.as_bytes()) {
            return Err(bad());
        }
        let payload = hex::decode(b64).map_err(|_| bad())?;
        let body: TokenBody = serde_json::from_slice(&payload).map_err(|_| bad())?;
        if now.secs - body.issued > TOKEN_TTL_SECS || body.issued - now.secs > 60 {
            return Err(Error::invalid(
                "the preview is older than 15 minutes",
                "preview the selection again",
            ));
        }
        Ok(body)
    }
}

/// What a compact would do or did.
#[derive(Debug, Clone, Serialize)]
pub struct CompactPreview {
    pub file_bytes: u64,
    pub reclaimable_bytes: u64,
    pub free_space_needed_bytes: u64,
    pub paused: bool,
}

impl DataKind {
    /// A recount inside the delete's own transaction.
    fn stats_tx(&self, tx: &Transaction, sel: &ResolvedSelector) -> Result<KindStats, Error> {
        self.stats(tx, sel)
    }
}

/// Run the import hook in one transaction. `Ok(true)` when it ran now,
/// `Ok(false)` when the marker said it already had.
fn run_import(db: &Db, hook: ImportHook, state_dir: &Path) -> Result<bool, Error> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::kinds::{Filter, TimeFormat};

    const T0: i64 = 1_800_000_000;

    fn schema() -> Vec<Migration> {
        vec![Migration::sql(
            "CREATE TABLE events (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, level TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0, msg TEXT NOT NULL) STRICT;
             CREATE TABLE snoozes (id INTEGER PRIMARY KEY, until INTEGER NOT NULL) STRICT;
             CREATE TABLE stamped (id INTEGER PRIMARY KEY, at TEXT NOT NULL) STRICT;
             CREATE TABLE millis (id INTEGER PRIMARY KEY, at INTEGER NOT NULL) STRICT;
             CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT NOT NULL) STRICT;",
        )]
    }

    fn kinds() -> Vec<DataKind> {
        vec![
            DataKind::new("events", "Events")
                .description("what happened")
                .table("events")
                .time_column("at", TimeFormat::UnixSeconds)
                .filter(Filter::choice("level", "Level", "level", ["info", "error"]))
                .filter(Filter::flag("seen", "Seen", "seen"))
                .filter(Filter::text("text", "Message contains", "msg")),
            DataKind::new("snoozes", "Snoozes")
                .table("snoozes")
                .time_column("until", TimeFormat::UnixSeconds)
                .finished_by_definition("until < :now"),
            DataKind::new("stamped", "Stamped")
                .table("stamped")
                .time_column("at", TimeFormat::Rfc3339),
            DataKind::new("millis", "Millis")
                .table("millis")
                .time_column("at", TimeFormat::UnixMillis),
        ]
    }

    fn seeded() -> AppDb {
        let app = AppDb::open_in_memory(
            AppDbSpec {
                migrations: schema(),
                import: None,
            },
            kinds(),
        )
        .unwrap();
        app.write_blocking(|tx| {
            // 10 events, one per day back from T0; day 0 is the newest.
            for day in 0..10i64 {
                tx.execute(
                    "INSERT INTO events (at, level, seen, msg) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![
                        T0 - day * 86_400,
                        if day % 2 == 0 { "info" } else { "error" },
                        i64::from(day < 3),
                        format!("message_{day} 50% done")
                    ],
                )?;
            }
            tx.execute("INSERT INTO settings VALUES ('theme', 'dark')", [])?;
            Ok(())
        })
        .unwrap();
        app
    }

    fn count(app: &AppDb, table: &str) -> i64 {
        app.read_blocking(|c| {
            Ok(c.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))?)
        })
        .unwrap()
    }

    fn older(days: u64) -> Selector {
        Selector {
            older_than_secs: Some(days * 86_400),
            ..Default::default()
        }
    }

    #[test]
    fn the_overview_lists_rows_oldest_newest_and_the_declared_filters() {
        let app = seeded();
        let ov = app.overview().unwrap();
        let e = ov.iter().find(|k| k.id == "events").unwrap();
        assert_eq!(e.stats.rows, 10);
        assert_eq!(
            e.stats.newest.as_deref(),
            Some(
                chrono::DateTime::from_timestamp(T0, 0)
                    .unwrap()
                    .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
                    .as_str()
            )
        );
        assert!(e.stats.oldest < e.stats.newest);
        assert!(e.stats.bytes > 0, "dbstat gives the table's share");
        assert_eq!(e.filters.len(), 3);
        assert!(e.supports_age && !e.finished_automatically);
        assert!(
            ov.iter()
                .find(|k| k.id == "snoozes")
                .unwrap()
                .finished_automatically
        );
        assert!(
            ov.iter().all(|k| k.id != "settings"),
            "an undeclared table is no kind"
        );
    }

    #[test]
    fn a_preview_reads_only_and_a_delete_removes_exactly_what_it_showed() {
        let app = seeded();
        let now = Now::at(T0);
        let before: i64 = app
            .read_blocking(|c| Ok(c.query_row("PRAGMA data_version", [], |r| r.get(0))?))
            .unwrap();
        let p = app.preview_at("events", &older(5), &now).unwrap();
        assert_eq!(p.stats.rows, 4, "days 6..9: strictly older than five days");
        assert_eq!(p.samples.len(), 4);
        assert_eq!(p.confirm_with, "events");
        assert_eq!(count(&app, "events"), 10, "a preview deletes nothing");
        let after: i64 = app
            .read_blocking(|c| Ok(c.query_row("PRAGMA data_version", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(before, after, "and writes nothing");
        // Samples are the OLDEST first.
        assert!(
            p.samples[0]["at"].as_i64() < p.samples[1]["at"].as_i64().or(Some(i64::MAX))
                || p.samples.len() == 1
        );

        let done = app
            .delete_at("events", &older(5), &p.token, "events", &now)
            .unwrap();
        assert_eq!(done.deleted, 4);
        assert_eq!(done.remaining, 6);
        assert_eq!(count(&app, "events"), 6);
        assert_eq!(count(&app, "settings"), 1, "nothing else was touched");
    }

    #[test]
    fn the_confirmation_must_be_the_kinds_name_and_the_token_must_be_ours() {
        let app = seeded();
        let now = Now::at(T0);
        let p = app.preview_at("events", &older(5), &now).unwrap();
        let err = app
            .delete_at("events", &older(5), &p.token, "yes", &now)
            .unwrap_err();
        assert!(err.remedy.contains("type `events`"), "{err}");
        let err = app
            .delete_at("events", &older(5), "garbage", "events", &now)
            .unwrap_err();
        assert!(err.message.contains("token"), "{err}");
        let mut forged = p.token.clone();
        forged.replace_range(0..2, "ff");
        assert!(
            app.delete_at("events", &older(5), &forged, "events", &now)
                .is_err()
        );
        // A token for another selector or kind is refused: it binds the selection.
        let err = app
            .delete_at("events", &older(2), &p.token, "events", &now)
            .unwrap_err();
        assert!(err.message.contains("does not match"), "{err}");
        let err = app
            .delete_at("snoozes", &older(5), &p.token, "snoozes", &now)
            .unwrap_err();
        assert!(err.message.contains("does not match"), "{err}");
        // Another AppDb (another secret) cannot honour it either.
        let other = seeded();
        assert!(
            other
                .delete_at("events", &older(5), &p.token, "events", &now)
                .is_err()
        );
        // Stale: older than 15 minutes.
        let late = Now::at(T0 + 16 * 60);
        let err = app
            .delete_at("events", &older(5), &p.token, "events", &late)
            .unwrap_err();
        assert!(err.message.contains("older than 15 minutes"), "{err}");
        assert_eq!(count(&app, "events"), 10, "every refusal deleted nothing");
    }

    /// Recount: a row that appeared after the preview changes the count, so
    /// the delete refuses instead of removing something nobody looked at.
    #[test]
    fn the_delete_recounts_and_refuses_when_the_selection_moved() {
        let app = seeded();
        let now = Now::at(T0);
        let p = app.preview_at("events", &older(5), &now).unwrap();
        app.write_blocking(|tx| {
            Ok(tx.execute(
                "INSERT INTO events (at, level, seen, msg) VALUES (?1, 'info', 0, 'late arrival')",
                [T0 - 9 * 86_400],
            )?)
        })
        .unwrap();
        let err = app
            .delete_at("events", &older(5), &p.token, "events", &now)
            .unwrap_err();
        assert!(
            err.message
                .contains("held 4 row(s) at the preview and holds 5 now"),
            "{err}"
        );
        assert_eq!(count(&app, "events"), 11, "nothing was deleted");
        // Preview again and the new count goes through.
        let p2 = app.preview_at("events", &older(5), &now).unwrap();
        assert_eq!(p2.stats.rows, 5);
        assert_eq!(
            app.delete_at("events", &older(5), &p2.token, "events", &now)
                .unwrap()
                .deleted,
            5
        );
    }

    /// The age is fixed at the preview: a delete later does not sweep in
    /// rows that only became old in between.
    #[test]
    fn the_age_is_an_absolute_instant_fixed_at_the_preview() {
        let app = seeded();
        let p = app.preview_at("events", &older(5), &Now::at(T0)).unwrap();
        let later = Now::at(T0 + 600);
        let done = app
            .delete_at("events", &older(5), &p.token, "events", &later)
            .unwrap();
        assert_eq!(done.deleted, 4);
    }

    #[test]
    fn filters_narrow_by_choice_flag_and_text_with_wildcards_escaped() {
        let app = seeded();
        let now = Now::at(T0);
        let with = |name: &str, value: &str| {
            let mut s = Selector::default();
            s.filters.insert(name.into(), value.into());
            app.preview_at("events", &s, &now).unwrap().stats.rows
        };
        assert_eq!(with("level", "error"), 5);
        assert_eq!(with("seen", "true"), 3);
        assert_eq!(with("seen", "false"), 7);
        assert_eq!(with("text", "message_4"), 1);
        assert_eq!(
            with("text", "50% done"),
            10,
            "the % is literal, not a wildcard"
        );
        assert_eq!(with("text", "5_ done"), 0, "the _ is literal too");
        // Combined with age.
        let mut s = older(5);
        s.filters.insert("level".into(), "error".into());
        assert_eq!(app.preview_at("events", &s, &now).unwrap().stats.rows, 2); // days 7 and 9
        // Refusals name the way out.
        let mut s = Selector::default();
        s.filters.insert("level".into(), "fatal".into());
        assert!(
            app.preview_at("events", &s, &now)
                .unwrap_err()
                .remedy
                .contains("info, error")
        );
        let mut s = Selector::default();
        s.filters.insert("nope".into(), "x".into());
        assert!(
            app.preview_at("events", &s, &now)
                .unwrap_err()
                .remedy
                .contains("level, seen, text")
        );
        let mut s = Selector::default();
        s.filters.insert("seen".into(), "maybe".into());
        assert!(app.preview_at("events", &s, &now).is_err());
        assert!(
            app.preview_at("settings", &Selector::default(), &now)
                .is_err(),
            "no such kind"
        );
        // A kind without a time cannot be limited by age.
    }

    #[test]
    fn rfc3339_and_millisecond_columns_compare_in_their_own_format() {
        let app = seeded();
        let now = Now::at(T0);
        app.write_blocking(|tx| {
            for day in 0..4i64 {
                let at = T0 - day * 86_400;
                tx.execute(
                    "INSERT INTO stamped (at) VALUES (?1)",
                    [chrono::DateTime::from_timestamp(at, 0)
                        .unwrap()
                        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)],
                )?;
                tx.execute("INSERT INTO millis (at) VALUES (?1)", [at * 1000])?;
            }
            Ok(())
        })
        .unwrap();
        for kind in ["stamped", "millis"] {
            let p = app.preview_at(kind, &older(2), &now).unwrap();
            assert_eq!(
                p.stats.rows, 1,
                "{kind}: only day 3 is strictly older than two days"
            );
            assert!(
                p.stats.oldest.as_deref().unwrap().ends_with('Z'),
                "{kind}: shown as RFC 3339"
            );
        }
    }

    #[test]
    fn a_wrong_declaration_is_a_start_error() {
        for (kind, needle) in [
            (
                DataKind::new("Bad-Id", "x").table("events"),
                "the id must be",
            ),
            (
                DataKind::new("ghost", "x").table("nothing"),
                "no table `nothing`",
            ),
            (
                DataKind::new("a", "x")
                    .table("events")
                    .time_column("when", TimeFormat::UnixSeconds),
                "no time column",
            ),
            (
                DataKind::new("a", "x")
                    .table("events")
                    .filter(Filter::flag("f", "F", "nope")),
                "no column `nope`",
            ),
            (DataKind::new("a", "x").table("chassis_meta"), "reserved"),
            (
                DataKind::new("a", "x").table("events; DROP TABLE events"),
                "not a table name",
            ),
        ] {
            let err = AppDb::open_in_memory(
                AppDbSpec {
                    migrations: schema(),
                    import: None,
                },
                vec![kind],
            )
            .unwrap_err();
            assert!(err.message.contains(needle), "{needle}: {err}");
        }
        let err = AppDb::open_in_memory(
            AppDbSpec {
                migrations: schema(),
                import: None,
            },
            vec![
                DataKind::new("a", "x")
                    .table("events")
                    .finished_by_definition("nonsense <<<"),
            ],
        )
        .unwrap_err();
        assert!(err.message.contains("finished_by_definition"), "{err}");
        let err = AppDb::open_in_memory(
            AppDbSpec {
                migrations: schema(),
                import: None,
            },
            vec![
                DataKind::new("a", "x").table("events"),
                DataKind::new("a", "y").table("snoozes"),
            ],
        )
        .unwrap_err();
        assert!(err.message.contains("twice"), "{err}");
    }

    /// Finished-by-definition pruning touches only what a kind declared:
    /// not its other rows, not a kind without a rule, not an undeclared table.
    #[test]
    fn pruning_touches_only_declared_finished_rows() {
        let app = seeded();
        app.write_blocking(|tx| {
            tx.execute(
                "INSERT INTO snoozes (until) VALUES (?1), (?2), (?3)",
                [T0 - 10, T0 - 1, T0 + 100],
            )?;
            Ok(())
        })
        .unwrap();
        let removed = app.prune_finished_at(&Now::at(T0)).unwrap();
        assert_eq!(
            removed,
            vec![("snoozes".to_string(), 2)],
            "only the kind with a rule reports"
        );
        assert_eq!(count(&app, "snoozes"), 1, "the running snooze stays");
        assert_eq!(
            count(&app, "events"),
            10,
            "a kind without a rule is never auto-pruned, however old"
        );
        assert_eq!(
            count(&app, "settings"),
            1,
            "an undeclared table is never touched"
        );
        // Nothing left to remove the second time.
        assert_eq!(
            app.prune_finished_at(&Now::at(T0)).unwrap(),
            vec![("snoozes".to_string(), 0)]
        );
    }

    #[test]
    fn compact_reclaims_the_pages_a_delete_freed_and_is_refused_while_paused() {
        let dir = tempfile::tempdir().unwrap();
        let app = AppDb::open(
            &dir.path().join("a.db"),
            AppDbSpec {
                migrations: schema(),
                import: None,
            },
            kinds(),
        )
        .unwrap();
        app.write_blocking(|tx| {
            for i in 0..400i64 {
                tx.execute(
                    "INSERT INTO events (at, level, msg) VALUES (?1, 'info', ?2)",
                    rusqlite::params![i, "x".repeat(500)],
                )?;
            }
            Ok(())
        })
        .unwrap();
        let sel = Selector::default();
        let p = app.preview("events", &sel).unwrap();
        let del = app.delete("events", &sel, &p.token, "events").unwrap();
        assert_eq!(del.deleted, 400);
        assert!(del.reclaimable_bytes > 100_000, "{del:?}");
        let before = app.compact_preview().unwrap();
        assert_eq!(before.reclaimable_bytes, del.reclaimable_bytes);
        let after = app.compact().unwrap();
        assert_eq!(after.reclaimable_bytes, 0);
        assert!(after.file_bytes < before.file_bytes);
    }

    // ---- the import hook --------------------------------------------------

    fn import_spec(
        rows: u64,
        report_expected: u64,
        fail_after: bool,
        files: Vec<PathBuf>,
    ) -> AppDbSpec {
        AppDbSpec {
            migrations: schema(),
            import: Some(Box::new(move |tx, _ctx| {
                for i in 0..rows {
                    tx.execute("INSERT INTO settings VALUES (?1, 'v')", [format!("k{i}")])?;
                }
                if fail_after {
                    return Err(Error::dependency(
                        "the old file was torn at row 3",
                        "restore it",
                    ));
                }
                Ok(ImportReport {
                    expected: report_expected,
                    imported: rows,
                    files,
                })
            })),
        }
    }

    #[test]
    fn a_good_import_commits_with_its_marker_renames_the_files_and_never_runs_again() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("old.json");
        std::fs::write(&old, b"[1,2,3]").unwrap();
        let path = dir.path().join("a.db");
        let app = AppDb::open(&path, import_spec(3, 3, false, vec![old.clone()]), vec![]).unwrap();
        assert_eq!(app.import_state(), ImportState::Done);
        assert_eq!(count(&app, "settings"), 3);
        assert!(!old.exists() && dir.path().join("old.json.migrated").exists());
        drop(app);
        // A second start with a hook that would double the rows: the marker holds.
        std::fs::write(&old, b"[1,2,3]").unwrap();
        let app = AppDb::open(&path, import_spec(3, 3, false, vec![old.clone()]), vec![]).unwrap();
        assert_eq!(
            count(&app, "settings"),
            3,
            "idempotent: the hook did not run"
        );
        assert!(old.exists(), "and renamed nothing");
    }

    #[test]
    fn a_failed_import_rolls_back_whole_keeps_the_old_files_raises_a_problem_and_retries() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("old.json");
        std::fs::write(&old, b"[1,2,3]").unwrap();
        let path = dir.path().join("a.db");
        let app = AppDb::open(&path, import_spec(3, 3, true, vec![old.clone()]), vec![]).unwrap();
        assert!(
            matches!(app.import_state(), ImportState::Failed { .. }),
            "{:?}",
            app.import_state()
        );
        assert_eq!(
            count(&app, "settings"),
            0,
            "three rows were written inside the transaction and none survived"
        );
        assert!(
            old.exists() && !dir.path().join("old.json.migrated").exists(),
            "the old files stay"
        );
        let problems = app.problems();
        assert_eq!(problems.len(), 1);
        assert!(
            problems[0].why.contains("keeps using its old files"),
            "{problems:?}"
        );
        assert!(problems[0].remedy.contains("next start"), "{problems:?}");
        assert!(
            meta_get_blocking(&app, "import_done").is_none(),
            "no marker"
        );
        drop(app);
        // The next start, with a hook that works, imports.
        let app = AppDb::open(&path, import_spec(3, 3, false, vec![old.clone()]), vec![]).unwrap();
        assert_eq!(app.import_state(), ImportState::Done);
        assert_eq!(count(&app, "settings"), 3);
        assert!(app.problems().is_empty());
    }

    #[test]
    fn a_count_mismatch_rolls_the_import_back_too() {
        let dir = tempfile::tempdir().unwrap();
        let app = AppDb::open(
            &dir.path().join("a.db"),
            import_spec(3, 4, false, vec![]),
            vec![],
        )
        .unwrap();
        assert!(matches!(app.import_state(), ImportState::Failed { .. }));
        assert_eq!(count(&app, "settings"), 0);
        assert!(
            app.problems()[0]
                .why
                .contains("wrote 3 row(s) but the old files held 4"),
            "{:?}",
            app.problems()
        );
    }

    /// Two starts racing on one file import once: the marker is re-read
    /// inside the write transaction.
    #[test]
    fn two_racing_starts_import_once() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.db");
        let handles: Vec<_> = (0..4)
            .map(|_| {
                let path = path.clone();
                std::thread::spawn(move || {
                    AppDb::open(&path, import_spec(5, 5, false, vec![]), vec![]).unwrap()
                })
            })
            .collect();
        let apps: Vec<AppDb> = handles.into_iter().map(|h| h.join().unwrap()).collect();
        assert_eq!(count(&apps[0], "settings"), 5, "5 rows, not 5 x 4");
    }

    fn meta_get_blocking(app: &AppDb, key: &str) -> Option<String> {
        app.read_blocking(|c| meta_get(c, key)).unwrap()
    }

    #[test]
    fn a_handle_that_never_opened_says_so_instead_of_panicking() {
        let h = AppDb::unopened().unwrap();
        let err = h.read_blocking(|_| Ok(())).unwrap_err();
        assert!(err.message.contains("not open yet"), "{err}");
        assert!(h.kinds().is_empty());
    }
}
