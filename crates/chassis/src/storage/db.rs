//! The sqlite handle every storage file is opened through: one writer, two
//! readers, the durability pragmas, numbered migrations and the async API.
//!
//! The shape is kyu's (its ADR T2), carried over so a service gets the same
//! behaviour from the kit: WAL, `synchronous=FULL`, a 5 s busy timeout,
//! `foreign_keys=ON`, one write connection behind a mutex plus a small pool
//! of read-only connections, every call under `spawn_blocking`.
//!
//! A write is `BEGIN IMMEDIATE` and holds a [`crate::shell::backup::WriteTicket`]
//! for the whole transaction, so the backup pause (feat-backup-1) covers
//! sqlite writes exactly as it covers the kit's JSON files: a pause waits for
//! the tickets, then checkpoints the log (see [`Db::checkpoint`]).
//!
//! Migrations are a numbered list; the version lives in `PRAGMA
//! user_version`. Each one runs in its own transaction together with the
//! version bump, so a crash or an error leaves the database at the previous
//! version, never half-migrated. A database NEWER than the binary is refused
//! with a remedy: guessing at a schema this build does not know is how data
//! gets mangled.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use rusqlite::{Connection, Transaction, TransactionBehavior};

use crate::core::error::{Error, Kind};
use crate::shell::backup::{self, HELD_WRITE_LIMIT, WriteTicket};

mod error_map;
mod inspect;
mod maintenance;
mod migrate;
mod open;
#[cfg(test)]
mod tests;

pub(crate) use maintenance::vacuum_into_conn;
use open::{META_DDL, pragmas};

/// How long a statement waits for a lock before it gives up.
pub const BUSY_TIMEOUT: Duration = Duration::from_millis(5_000);
/// Bytes the write-ahead log is trimmed back to after a checkpoint.
pub(crate) const WAL_SIZE_LIMIT: i64 = 1_048_576;

/// Read-only connections next to the one writer.
pub const READERS: usize = 2;

/// How long a failed write keeps the file marked unhealthy.
const WRITE_FAILURE_WINDOW: Duration = Duration::from_secs(60);

type StepFn = Arc<dyn Fn(&Transaction) -> Result<(), Error> + Send + Sync>;

/// One step of a schema: plain SQL or code. Append only: never edit a
/// published step, or databases in the field diverge from new ones.
#[derive(Clone)]
pub struct Migration(StepFn);

impl Migration {
    /// A step that is a batch of SQL statements.
    pub fn sql(sql: &'static str) -> Self {
        Migration(Arc::new(move |tx| {
            tx.execute_batch(sql).map_err(Error::from)
        }))
    }

    /// A step that is code, for a change SQL alone cannot make (copying
    /// rows through a transformation).
    pub fn code(f: impl Fn(&Transaction) -> Result<(), Error> + Send + Sync + 'static) -> Self {
        Migration(Arc::new(f))
    }
}

impl std::fmt::Debug for Migration {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Migration(..)")
    }
}

/// What `--check` learns about a database file without touching it.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub struct Inspection {
    pub path: PathBuf,
    /// `false`: no file yet, it is created at start.
    pub exists: bool,
    /// `PRAGMA user_version`, when the file exists.
    pub schema: Option<usize>,
    /// How many migrations this binary knows.
    pub known: usize,
    pub quick_check: Option<String>,
}

impl Inspection {
    /// The database is newer than this binary.
    pub fn is_newer(&self) -> bool {
        self.schema.is_some_and(|s| s > self.known)
    }

    /// One line for `--check`.
    pub fn describe(&self) -> String {
        match self.schema {
            None => format!(
                "no database yet at {}; it is created at start",
                self.path.display()
            ),
            Some(s) if s > self.known => format!(
                "database at {} is schema {s} but this binary knows {}: it was written by a newer build",
                self.path.display(),
                self.known
            ),
            Some(s) if s < self.known => format!(
                "database at {} is readable and intact: schema {s}, this binary knows {}; the migration runs at start, --check applies nothing",
                self.path.display(),
                self.known
            ),
            Some(s) => format!(
                "database OK at {} (schema {s}, current)",
                self.path.display()
            ),
        }
    }
}

/// Sizes of one database, for the budget and the Storage page.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize)]
#[non_exhaustive]
pub struct FileSizes {
    /// `page_count * page_size`.
    pub db_bytes: u64,
    /// The write-ahead log on disk.
    pub wal_bytes: u64,
    /// Pages SQLite could hand back with a VACUUM.
    pub reclaimable_bytes: u64,
}

impl FileSizes {
    /// Sizes built by hand (3.12.0), for a test of code that reads a
    /// [`super::StorageReport`].
    pub fn new(db_bytes: u64, wal_bytes: u64, reclaimable_bytes: u64) -> Self {
        FileSizes {
            db_bytes,
            wal_bytes,
            reclaimable_bytes,
        }
    }

    pub fn total(&self) -> u64 {
        self.db_bytes + self.wal_bytes
    }
}

struct Inner {
    path: Option<PathBuf>,
    writer: Mutex<Connection>,
    readers: Vec<Mutex<Connection>>,
    schema: usize,
    last_failure: Mutex<Option<(Instant, String)>>,
}

/// A sqlite database with one writer and two readers. Cheap to clone.
#[derive(Clone)]
pub struct Db {
    inner: Arc<Inner>,
}

impl std::fmt::Debug for Db {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Db")
            .field("path", &self.inner.path)
            .finish()
    }
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Read a value from the kit's `chassis_meta` table.
pub fn meta_get(conn: &Connection, key: &str) -> Result<Option<String>, Error> {
    use rusqlite::OptionalExtension;
    Ok(conn
        .query_row(
            "SELECT value FROM chassis_meta WHERE key = ?1",
            [key],
            |r| r.get(0),
        )
        .optional()?)
}

/// Write a value into the kit's `chassis_meta` table.
pub fn meta_set(conn: &Connection, key: &str, value: &str) -> Result<(), Error> {
    conn.execute(
        "INSERT INTO chassis_meta (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

impl Db {
    /// Open (creating it) the file at `path`, bring its schema up to date.
    pub fn open(path: &Path, migrations: &[Migration]) -> Result<Db, Error> {
        open::open_file(path, migrations)
    }

    /// A database in memory, for fast logic tests. WAL does not apply to a
    /// memory database, so a test of durability or of the pause uses
    /// [`Db::open`] on a real file; reads share the writer here.
    pub fn open_in_memory(migrations: &[Migration]) -> Result<Db, Error> {
        let mut writer = Connection::open_in_memory()?;
        pragmas(&writer, false)?;
        writer.execute_batch(META_DDL)?;
        let schema = migrate::migrate(&mut writer, migrations, ":memory:")?;
        Ok(Db {
            inner: Arc::new(Inner {
                path: None,
                writer: Mutex::new(writer),
                readers: Vec::new(),
                schema,
                last_failure: Mutex::new(None),
            }),
        })
    }

    /// What `--check` asks: does the file open, is it intact, how far is it
    /// from this binary. Read-only, no pragma set, nothing created or
    /// migrated.
    pub fn inspect(path: &Path, known: usize) -> Result<Inspection, Error> {
        inspect::inspect_file(path, known)
    }

    /// Change how long the write connection waits for a lock. The default
    /// is [`BUSY_TIMEOUT`]; a test of a refused checkpoint lowers it so it
    /// does not wait five seconds on the clock.
    pub fn set_busy_timeout(&self, wait: Duration) -> Result<(), Error> {
        lock(&self.inner.writer).busy_timeout(wait)?;
        Ok(())
    }

    /// The file, `None` for a memory database.
    pub fn path(&self) -> Option<&Path> {
        self.inner.path.as_deref()
    }

    /// The schema version after open (the number of migrations applied).
    pub fn schema_version(&self) -> usize {
        self.inner.schema
    }

    // ---- the synchronous core -------------------------------------------

    /// Run a read on a pooled read-only connection (or the writer, in
    /// memory). Blocks the calling thread: use [`Db::read`] from async code.
    pub fn read_blocking<T>(
        &self,
        f: impl FnOnce(&Connection) -> Result<T, Error>,
    ) -> Result<T, Error> {
        for r in &self.inner.readers {
            if let Ok(conn) = r.try_lock() {
                return f(&conn);
            }
        }
        if let Some(r) = self.inner.readers.first() {
            return f(&lock(r));
        }
        f(&lock(&self.inner.writer))
    }

    /// Run `f` in one `BEGIN IMMEDIATE` transaction, committing when it
    /// returns `Ok`, holding a write ticket throughout. Blocks the calling
    /// thread; a backup pause holds it for at most
    /// [`backup::HELD_WRITE_LIMIT`], then it fails with a retryable 503.
    pub fn write_blocking<T>(
        &self,
        f: impl FnOnce(&Transaction) -> Result<T, Error>,
    ) -> Result<T, Error> {
        let ticket = backup::writing_blocking_within(HELD_WRITE_LIMIT)?;
        self.write_with_ticket(ticket, f)
    }

    fn write_with_ticket<T>(
        &self,
        ticket: WriteTicket,
        f: impl FnOnce(&Transaction) -> Result<T, Error>,
    ) -> Result<T, Error> {
        let mut conn = lock(&self.inner.writer);
        let out = (|| {
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let value = f(&tx)?;
            tx.commit()?;
            Ok(value)
        })();
        drop(conn);
        drop(ticket);
        self.note_write(&out);
        out
    }

    fn note_write<T>(&self, out: &Result<T, Error>) {
        // A business refusal (Invalid, NotFound) is not a sick file.
        match out {
            Err(e) if matches!(e.kind, Kind::Dependency | Kind::Overloaded | Kind::Internal) => {
                *lock(&self.inner.last_failure) = Some((Instant::now(), e.message.clone()));
            }
            Ok(_) => *lock(&self.inner.last_failure) = None,
            Err(_) => {}
        }
    }

    /// The reason a write failed in the last minute, if one did.
    pub fn recent_write_failure(&self) -> Option<String> {
        lock(&self.inner.last_failure)
            .as_ref()
            .filter(|(at, _)| at.elapsed() < WRITE_FAILURE_WINDOW)
            .map(|(_, why)| why.clone())
    }

    // ---- the async API ---------------------------------------------------

    /// [`Db::read_blocking`] under `spawn_blocking`.
    pub async fn read<T, F>(&self, f: F) -> Result<T, Error>
    where
        T: Send + 'static,
        F: FnOnce(&Connection) -> Result<T, Error> + Send + 'static,
    {
        let db = self.clone();
        join(tokio::task::spawn_blocking(move || db.read_blocking(f)).await)
    }

    /// One write transaction under `spawn_blocking`. The ticket is taken
    /// first without blocking a runtime thread, so a paused backup holds
    /// the caller, not a worker.
    pub async fn write<T, F>(&self, f: F) -> Result<T, Error>
    where
        T: Send + 'static,
        F: FnOnce(&Transaction) -> Result<T, Error> + Send + 'static,
    {
        let ticket = backup::writing_within(HELD_WRITE_LIMIT).await?;
        let db = self.clone();
        join(tokio::task::spawn_blocking(move || db.write_with_ticket(ticket, f)).await)
    }

    // ---- maintenance -----------------------------------------------------

    /// Fold the log into the database and truncate it, so the files on disk
    /// stand still (what the backup pause needs). TRUNCATE, not PASSIVE, on
    /// purpose: PASSIVE gives up quietly while a reader holds the log, which
    /// would look like success and leave the very file we came to settle.
    /// A busy answer (after the 5 s busy timeout) is an error, and the
    /// pause then falls back to stopping the unit. Takes no write ticket:
    /// it runs INSIDE the pause, after the tickets drained.
    pub fn checkpoint(&self) -> Result<(), Error> {
        maintenance::checkpoint_writer(&self.inner)
    }

    /// Write a complete, consistent copy of the database to `dest` while
    /// the service keeps running (`VACUUM INTO`); copying the file by hand
    /// mid-write is what this exists to stop. `dest` must not exist; it is
    /// checked with `integrity_check` afterwards. Used for the pre-update
    /// state copy.
    pub fn vacuum_into(&self, dest: &Path) -> Result<u64, Error> {
        let to = dest.to_string_lossy().into_owned();
        self.read_blocking(|c| vacuum_into_conn(c, dest, &to))
    }

    /// Reclaim free pages (`VACUUM`). Runs outside a transaction, so it is
    /// not a [`Db::write`]; it takes a ticket itself and the caller must
    /// have refused it during a pause already.
    pub fn vacuum_blocking(&self) -> Result<(), Error> {
        let ticket = backup::writing_blocking_within(HELD_WRITE_LIMIT)?;
        let conn = lock(&self.inner.writer);
        let out = conn.execute_batch("VACUUM").map_err(Error::from);
        drop(conn);
        drop(ticket);
        self.note_write(&out);
        out
    }

    /// `VACUUM` under `spawn_blocking`.
    pub async fn vacuum(&self) -> Result<(), Error> {
        let db = self.clone();
        join(tokio::task::spawn_blocking(move || db.vacuum_blocking()).await)
    }

    /// Sizes for the budget; the log is read from disk.
    pub fn sizes(&self) -> Result<FileSizes, Error> {
        maintenance::sizes_of(self)
    }
}

/// `<file>-wal` beside the database.
pub fn wal_path(db: &Path) -> PathBuf {
    let mut s = db.as_os_str().to_owned();
    s.push("-wal");
    PathBuf::from(s)
}

fn join<T>(r: Result<Result<T, Error>, tokio::task::JoinError>) -> Result<T, Error> {
    r.unwrap_or_else(|e| {
        Err(Error::internal(
            format!("a database task failed: {e}"),
            "report this to the project",
        ))
    })
}
