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

use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use rusqlite::Transaction;
use serde::{Deserialize, Serialize};
use serde_json::Value as Json;

use super::db::{Db, DbOptions, Migration};
use super::kinds::{DataKind, KindStats, ResolvedSelector, Selector};
use crate::core::error::Error;

/// What the import hook may need to know.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub struct ImportContext {
    /// The state directory the old files live in.
    pub state_dir: PathBuf,
}

/// What an import hook reports back.
#[derive(Debug, Clone, Default)]
#[non_exhaustive]
pub struct ImportReport {
    /// How many records the old files held.
    pub expected: u64,
    /// How many rows the hook wrote. Must equal `expected`, or the whole
    /// import is rolled back.
    pub imported: u64,
    /// The old files to rename to `<name>.migrated` once the import
    /// committed.
    pub files: Vec<PathBuf>,
    /// The per-store figures when the hook reported them with
    /// [`ImportReport::from_stores`]; each is checked on its own and a
    /// mismatch names the store.
    pub stores: Vec<ImportStore>,
}

impl ImportReport {
    /// What the hook reports: the records the old files held, the rows it
    /// wrote, and the old files to rename `*.migrated` once it committed.
    pub fn new(expected: u64, imported: u64, files: Vec<PathBuf>) -> Self {
        ImportReport {
            expected,
            imported,
            files,
            stores: Vec::new(),
        }
    }

    /// A report per store (3.12.0): each store's `expected` must equal its
    /// `imported` (a mismatch rolls the whole import back and names the
    /// store), and only the files of stores marked
    /// [`ImportStore::moved`] are renamed, so a store that is copied but
    /// still runs on its JSON file is never renamed away from under the
    /// running code.
    pub fn from_stores(stores: Vec<ImportStore>) -> Self {
        ImportReport {
            expected: stores.iter().map(|s| s.expected).sum(),
            imported: stores.iter().map(|s| s.imported).sum(),
            files: stores.iter().flat_map(|s| s.files.clone()).collect(),
            stores,
        }
    }
}

/// One store of an import (3.12.0, homelab gap 140): what it held, what the
/// hook wrote, and the old files that go away ONLY if the project says the
/// store now lives in the database.
#[derive(Debug, Clone, Default)]
#[non_exhaustive]
pub struct ImportStore {
    pub name: String,
    pub expected: u64,
    pub imported: u64,
    /// Renamed `*.migrated` after the commit, for a store reported as
    /// moved; empty for a store that was copied but still runs on its old
    /// file.
    pub files: Vec<PathBuf>,
}

impl ImportStore {
    /// A store copied in: its name, the records the old file held and the
    /// rows written. Its files stay where they are until
    /// [`ImportStore::moved`] says otherwise.
    pub fn new(name: &str, expected: u64, imported: u64) -> Self {
        ImportStore {
            name: name.to_string(),
            expected,
            imported,
            files: Vec::new(),
        }
    }

    /// The store now lives in the database: rename these old files
    /// `*.migrated` once the import committed.
    pub fn moved(mut self, files: Vec<PathBuf>) -> Self {
        self.files = files;
        self
    }
}

/// Runs once, in one transaction, when the marker is absent.
pub type ImportHook =
    Box<dyn FnOnce(&Transaction, &ImportContext) -> Result<ImportReport, Error> + Send>;

/// What a project hands [`crate::App::app_db`].
#[derive(Default)]
#[non_exhaustive]
pub struct AppDbSpec {
    /// The schema as a numbered list; each step atomic, append only.
    pub migrations: Vec<Migration>,
    /// Move the project's old data in, once.
    pub import: Option<ImportHook>,
    /// The pool and pre-migration copies (default: [`DbOptions::new`]).
    pub options: DbOptions,
}

impl AppDbSpec {
    /// A schema and no import.
    pub fn new(migrations: Vec<Migration>) -> Self {
        AppDbSpec {
            migrations,
            import: None,
            options: DbOptions::new(),
        }
    }

    /// Open the app file with these pool and copy options (see
    /// [`DbOptions`]), e.g. four read-write readers and three copies kept
    /// before a migration.
    pub fn with_options(mut self, options: DbOptions) -> Self {
        self.options = options;
        self
    }

    /// Move the project's old data in, once (see the module docs).
    pub fn with_import(
        mut self,
        hook: impl FnOnce(&Transaction, &ImportContext) -> Result<ImportReport, Error> + Send + 'static,
    ) -> Self {
        self.import = Some(Box::new(hook));
        self
    }
}

/// How the one-time import stands.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
#[non_exhaustive]
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
#[non_exhaustive]
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

/// The `chassis_meta` key that holds when the app file was last compacted.
const LAST_COMPACTED_KEY: &str = "storage.last_compacted_at";

/// How long a preview token stays valid.
const TOKEN_TTL_SECS: i64 = 15 * 60;

/// A preview, and the token that binds a delete to it.
#[derive(Debug, Clone, Serialize)]
#[non_exhaustive]
pub struct Preview {
    pub kind: String,
    pub label: String,
    #[serde(flatten)]
    pub stats: KindStats,
    pub samples: Vec<Json>,
    /// The columns of a sample row in the table's order (empty for a custom
    /// kind), and the one that holds an instant (an RFC 3339 string).
    pub columns: Vec<String>,
    pub time_column: Option<String>,
    /// What the person types to confirm: the kind's name as the page shows
    /// it (its label), so what is typed is what was read.
    pub confirm_with: String,
    /// Binds the selector, the instant and the count; the delete needs it.
    pub token: String,
}

/// What a delete did.
#[derive(Debug, Clone, Serialize)]
#[non_exhaustive]
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
#[non_exhaustive]
pub struct KindOverview {
    pub id: String,
    pub label: String,
    pub description: String,
    #[serde(flatten)]
    pub stats: KindStats,
    pub filters: Vec<super::kinds::Filter>,
    /// What its rows are called in a count: `rows`, `cells`, `samples`.
    pub unit: String,
    pub supports_age: bool,
    pub finished_automatically: bool,
}

/// What a compact would do or did.
#[derive(Debug, Clone, Serialize)]
#[non_exhaustive]
pub struct CompactPreview {
    pub file_bytes: u64,
    pub reclaimable_bytes: u64,
    pub free_space_needed_bytes: u64,
    pub paused: bool,
}

mod access;
mod compact;
mod import;
mod lifecycle;
mod operations;
mod status;
#[cfg(test)]
mod tests;
mod token;

pub(crate) use import::rename_migrated;
