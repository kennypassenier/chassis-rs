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

use rusqlite::{Connection, Transaction};

use crate::core::error::Error;

mod access;
mod error_map;
mod inspect;
mod maintenance;
mod migrate;
mod open;
#[cfg(test)]
mod tests;

pub(crate) use maintenance::vacuum_into_conn;

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
    // ---- maintenance -----------------------------------------------------
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
