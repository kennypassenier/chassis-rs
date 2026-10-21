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

use rusqlite::{Connection, OpenFlags, Transaction, TransactionBehavior};

use crate::core::error::{Error, Kind};
use crate::shell::backup::{self, HELD_WRITE_LIMIT, WriteTicket};

/// How long a statement waits for a lock before it gives up.
pub const BUSY_TIMEOUT: Duration = Duration::from_millis(5_000);

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

impl From<rusqlite::Error> for Error {
    fn from(e: rusqlite::Error) -> Self {
        use rusqlite::ErrorCode;
        let busy = matches!(
            e.sqlite_error_code(),
            Some(ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked)
        );
        if busy {
            return Error::new(
                Kind::Overloaded,
                format!("the database is busy: {e}"),
                "retry in a moment; another process holds the file (a backup tool, a second instance)",
            );
        }
        let full = matches!(e.sqlite_error_code(), Some(ErrorCode::DiskFull));
        Error::dependency(
            format!("database error: {e}"),
            if full {
                "the disk is full; free space under the state directory"
            } else {
                "check free space and that the state directory is writable by the service user; if it persists, restore the file from the last backup or pre-update copy"
            },
        )
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

fn pragmas(conn: &Connection, wal: bool) -> Result<(), Error> {
    conn.busy_timeout(BUSY_TIMEOUT)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    if wal {
        let mode: String = conn.query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))?;
        if !mode.eq_ignore_ascii_case("wal") {
            return Err(Error::config(
                format!("SQLite refused write-ahead logging and settled on `{mode}`"),
                "keep the state directory on a local filesystem; a network mount cannot give WAL, and the durability promise depends on it",
            ));
        }
    }
    conn.pragma_update(None, "synchronous", "FULL")?;
    Ok(())
}

/// Bookkeeping the kit itself needs (import markers, format versions),
/// outside the numbered migrations so a project's list is all its own.
const META_DDL: &str =
    "CREATE TABLE IF NOT EXISTS chassis_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;";

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

fn migrate(conn: &mut Connection, migrations: &[Migration], path: &str) -> Result<usize, Error> {
    let current: usize =
        conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? as usize;
    if current > migrations.len() {
        return Err(Error::config(
            format!(
                "the database {path} is schema {current} but this build knows {}",
                migrations.len()
            ),
            "it was written by a newer build; run that build, or restore the pre-update copy (<name>-pre-update/<version>/) taken before the update",
        ));
    }
    for (i, step) in migrations.iter().enumerate().skip(current) {
        let version = i + 1;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        // Another process starting at the same moment may have applied this
        // step between the read above and the lock: look again under it.
        let applied = tx.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? as usize;
        if applied >= version {
            continue;
        }
        (step.0)(&tx).map_err(|e| {
            Error::new(
                e.kind,
                format!(
                    "migration {version} of {path} failed and was rolled back: {}",
                    e.message
                ),
                e.remedy,
            )
        })?;
        // `user_version` takes no bound parameter; the number is ours.
        tx.execute_batch(&format!("PRAGMA user_version = {version}"))?;
        tx.commit()?;
        tracing::info!(file = path, version, "database migrated");
    }
    Ok(migrations.len())
}

impl Db {
    /// Open (creating it) the file at `path`, bring its schema up to date.
    pub fn open(path: &Path, migrations: &[Migration]) -> Result<Db, Error> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| {
                Error::config(
                    format!("cannot create {}: {e}", dir.display()),
                    "create the state directory and make the service user its owner",
                )
            })?;
        }
        let shown = path.display().to_string();
        let mut writer = Connection::open(path).map_err(|e| {
            Error::config(
                format!("cannot open the database {shown}: {e}"),
                "check the state directory's permissions; the service user must own it",
            )
        })?;
        // Two processes starting on one file at the same moment can find
        // the first WAL switch locked; the setup is idempotent, so retry.
        let mut attempt = 0;
        let schema = loop {
            let setup = (|| {
                pragmas(&writer, true)?;
                writer.execute_batch(META_DDL)?;
                migrate(&mut writer, migrations, &shown)
            })();
            match setup {
                Err(e) if e.kind == Kind::Overloaded && attempt < 40 => {
                    attempt += 1;
                    std::thread::sleep(Duration::from_millis(50));
                }
                other => break other?,
            }
        };
        let mut readers = Vec::with_capacity(READERS);
        for _ in 0..READERS {
            let r = Connection::open_with_flags(
                path,
                OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
            )
            .map_err(|e| {
                Error::config(
                    format!("cannot open a read connection to {shown}: {e}"),
                    "check the file's permissions",
                )
            })?;
            pragmas(&r, false)?;
            readers.push(Mutex::new(r));
        }
        Ok(Db {
            inner: Arc::new(Inner {
                path: Some(path.to_path_buf()),
                writer: Mutex::new(writer),
                readers,
                schema,
                last_failure: Mutex::new(None),
            }),
        })
    }

    /// A database in memory, for fast logic tests. WAL does not apply to a
    /// memory database, so a test of durability or of the pause uses
    /// [`Db::open`] on a real file; reads share the writer here.
    pub fn open_in_memory(migrations: &[Migration]) -> Result<Db, Error> {
        let mut writer = Connection::open_in_memory()?;
        pragmas(&writer, false)?;
        writer.execute_batch(META_DDL)?;
        let schema = migrate(&mut writer, migrations, ":memory:")?;
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
        if !path.exists() {
            return Ok(Inspection {
                path: path.to_path_buf(),
                exists: false,
                schema: None,
                known,
                quick_check: None,
            });
        }
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| {
            Error::config(
                format!("cannot open the database {} read-only: {e}", path.display()),
                "check the file's permissions; the service user must be able to read it",
            )
        })?;
        let quick: String = conn.query_row("PRAGMA quick_check(1)", [], |r| r.get(0))?;
        if quick != "ok" {
            return Err(Error::config(
                format!(
                    "the database {} is damaged: quick_check says `{quick}`",
                    path.display()
                ),
                "restore the newest backup or the pre-update copy before starting",
            ));
        }
        let schema = conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? as usize;
        Ok(Inspection {
            path: path.to_path_buf(),
            exists: true,
            schema: Some(schema),
            known,
            quick_check: Some(quick),
        })
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
        if self.inner.path.is_none() {
            return Ok(());
        }
        let conn = lock(&self.inner.writer);
        let (busy, _log, _done): (i64, i64, i64) =
            conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })?;
        if busy != 0 {
            return Err(Error::new(
                Kind::Overloaded,
                format!(
                    "the write-ahead log of {} could not be checkpointed: a reader or writer still holds it",
                    self.inner
                        .path
                        .as_deref()
                        .map_or_else(String::new, |p| p.display().to_string())
                ),
                "the pause falls back to stopping the unit; nothing is lost",
            ));
        }
        Ok(())
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
        let (pages, page_size, free) = self.read_blocking(|c| {
            Ok((
                c.query_row("PRAGMA page_count", [], |r| r.get::<_, i64>(0))?,
                c.query_row("PRAGMA page_size", [], |r| r.get::<_, i64>(0))?,
                c.query_row("PRAGMA freelist_count", [], |r| r.get::<_, i64>(0))?,
            ))
        })?;
        let wal = self
            .inner
            .path
            .as_ref()
            .map(|p| wal_path(p))
            .and_then(|p| std::fs::metadata(p).ok())
            .map_or(0, |m| m.len());
        Ok(FileSizes {
            db_bytes: (pages.max(0) * page_size.max(0)) as u64,
            wal_bytes: wal,
            reclaimable_bytes: (free.max(0) * page_size.max(0)) as u64,
        })
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

/// `VACUUM INTO` plus verification, on any connection.
pub(crate) fn vacuum_into_conn(conn: &Connection, dest: &Path, shown: &str) -> Result<u64, Error> {
    if dest.exists() {
        return Err(Error::invalid(
            format!("{shown} already exists; VACUUM INTO refuses to overwrite"),
            "choose another name or remove the old copy first",
        ));
    }
    conn.execute("VACUUM INTO ?1", [shown])?;
    let bytes = std::fs::metadata(dest).map_or(0, |m| m.len());
    let verify = Connection::open_with_flags(dest, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let integrity: String = verify.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if integrity != "ok" {
        return Err(Error::dependency(
            format!("the copy at {shown} is not a sound database ({integrity})"),
            "it was left in place for inspection; check free space and take another",
        ));
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn two() -> Vec<Migration> {
        vec![
            Migration::sql("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL) STRICT;"),
            Migration::sql("CREATE TABLE u (id INTEGER PRIMARY KEY) STRICT;"),
        ]
    }

    #[test]
    fn pragmas_are_set_on_the_writer_and_the_readers() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(&dir.path().join("a.db"), &two()).unwrap();
        let (mode, sync, fk, busy): (String, i64, i64, i64) = db
            .write_blocking(|tx| {
                Ok((
                    tx.query_row("PRAGMA journal_mode", [], |r| r.get(0))?,
                    tx.query_row("PRAGMA synchronous", [], |r| r.get(0))?,
                    tx.query_row("PRAGMA foreign_keys", [], |r| r.get(0))?,
                    tx.query_row("PRAGMA busy_timeout", [], |r| r.get(0))?,
                ))
            })
            .unwrap();
        assert_eq!(mode, "wal");
        assert_eq!(sync, 2, "FULL");
        assert_eq!(fk, 1);
        assert_eq!(busy, 5000);
        let (rsync, rfk, rbusy): (i64, i64, i64) = db
            .read_blocking(|c| {
                Ok((
                    c.query_row("PRAGMA synchronous", [], |r| r.get(0))?,
                    c.query_row("PRAGMA foreign_keys", [], |r| r.get(0))?,
                    c.query_row("PRAGMA busy_timeout", [], |r| r.get(0))?,
                ))
            })
            .unwrap();
        assert_eq!((rsync, rfk, rbusy), (2, 1, 5000));
        assert_eq!(db.schema_version(), 2);
    }

    #[test]
    fn a_reader_cannot_write() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(&dir.path().join("a.db"), &two()).unwrap();
        let err = db
            .read_blocking(|c| Ok(c.execute("INSERT INTO t (v) VALUES ('x')", [])?))
            .unwrap_err();
        assert!(
            err.message.contains("readonly") || err.message.contains("read-only"),
            "{err}"
        );
    }

    #[test]
    fn migrations_run_once_in_order_and_a_reopen_applies_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.db");
        let db = Db::open(&path, &two()[..1]).unwrap();
        assert_eq!(db.schema_version(), 1);
        drop(db);
        let db = Db::open(&path, &two()).unwrap();
        assert_eq!(db.schema_version(), 2);
        let n: i64 = db
            .read_blocking(|c| Ok(c.query_row("SELECT count(*) FROM u", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(n, 0);
    }

    /// A migration that fails halfway leaves the database exactly at the
    /// previous version: its DDL is rolled back with the version bump.
    #[test]
    fn a_failed_migration_rolls_back_whole_and_keeps_the_old_version() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.db");
        let mut steps = two()[..1].to_vec();
        steps.push(Migration::code(|tx| {
            tx.execute_batch("CREATE TABLE half (id INTEGER); INSERT INTO t (v) VALUES ('seed');")?;
            Err(Error::internal("boom", "none"))
        }));
        let err = Db::open(&path, &steps).unwrap_err();
        assert!(err.message.contains("migration 2"), "{err}");
        assert!(err.message.contains("rolled back"), "{err}");
        let insp = Db::inspect(&path, 2).unwrap();
        assert_eq!(insp.schema, Some(1), "still at the previous version");
        let conn = Connection::open(&path).unwrap();
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='half'")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert!(tables.is_empty(), "the half-made table is gone: {tables:?}");
        let n: i64 = conn
            .query_row("SELECT count(*) FROM t", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0, "the seed row went with it");
        drop(conn);
        // The next start, with a fixed step, migrates cleanly.
        let db = Db::open(&path, &two()).unwrap();
        assert_eq!(db.schema_version(), 2);
    }

    /// The process dying inside a migration transaction (no commit, no
    /// rollback call): on reopen the database is at the old version.
    #[test]
    fn a_crash_inside_a_migration_transaction_leaves_the_old_version() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.db");
        drop(Db::open(&path, &two()[..1]).unwrap());
        {
            let mut conn = Connection::open(&path).unwrap();
            let tx = conn
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .unwrap();
            tx.execute_batch("CREATE TABLE u (id INTEGER PRIMARY KEY); PRAGMA user_version = 2;")
                .unwrap();
            std::mem::forget(tx); // no commit, no rollback: the "crash"
            // `conn` drops here, closing the file mid-transaction.
        }
        assert_eq!(Db::inspect(&path, 2).unwrap().schema, Some(1));
        assert_eq!(Db::open(&path, &two()).unwrap().schema_version(), 2);
    }

    #[test]
    fn a_newer_database_is_refused_with_the_restore_remedy() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.db");
        drop(Db::open(&path, &two()).unwrap());
        let err = Db::open(&path, &two()[..1]).unwrap_err();
        assert!(err.message.contains("schema 2"), "{err}");
        assert!(err.remedy.contains("pre-update copy"), "{err}");
        assert!(Db::inspect(&path, 1).unwrap().is_newer());
    }

    #[test]
    fn inspect_creates_and_migrates_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.db");
        let none = Db::inspect(&path, 2).unwrap();
        assert!(!none.exists);
        assert!(none.describe().contains("created at start"));
        assert!(!path.exists());
        drop(Db::open(&path, &two()[..1]).unwrap());
        let behind = Db::inspect(&path, 2).unwrap();
        assert!(behind.describe().contains("migration runs at start"));
        assert_eq!(
            Db::inspect(&path, 2).unwrap().schema,
            Some(1),
            "not migrated by looking"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_failed_write_commits_nothing() {
        let db = Db::open_in_memory(&two()).unwrap();
        let err = db
            .write(|tx| {
                tx.execute("INSERT INTO t (v) VALUES ('a')", [])?;
                Err::<(), _>(Error::invalid("no", "no"))
            })
            .await
            .unwrap_err();
        assert_eq!(err.kind, Kind::Invalid);
        let n: i64 = db
            .read(|c| Ok(c.query_row("SELECT count(*) FROM t", [], |r| r.get(0))?))
            .await
            .unwrap();
        assert_eq!(n, 0);
        assert!(
            db.recent_write_failure().is_none(),
            "a refusal is not a sick file"
        );
    }

    /// Eight tasks and a second handle on the same file write at once: the
    /// single writer and the busy timeout serialise them, none fails.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn parallel_writers_all_land() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.db");
        let a = Db::open(&path, &two()).unwrap();
        let b = Db::open(&path, &two()).unwrap();
        let mut tasks = Vec::new();
        for i in 0..8 {
            let db = if i % 2 == 0 { a.clone() } else { b.clone() };
            tasks.push(tokio::spawn(async move {
                for j in 0..25 {
                    db.write(move |tx| {
                        tx.execute("INSERT INTO t (v) VALUES (?1)", [format!("{i}-{j}")])?;
                        Ok(())
                    })
                    .await
                    .unwrap();
                }
            }));
        }
        for t in tasks {
            t.await.unwrap();
        }
        let n: i64 = a
            .read(|c| Ok(c.query_row("SELECT count(*) FROM t", [], |r| r.get(0))?))
            .await
            .unwrap();
        assert_eq!(n, 200);
    }

    #[test]
    fn vacuum_into_makes_a_sound_copy_and_refuses_to_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(&dir.path().join("a.db"), &two()).unwrap();
        db.write_blocking(|tx| Ok(tx.execute("INSERT INTO t (v) VALUES ('kept')", [])?))
            .unwrap();
        let dest = dir.path().join("copy.db");
        db.vacuum_into(&dest).unwrap();
        let copy = Db::open(&dest, &two()).unwrap();
        let v: String = copy
            .read_blocking(|c| Ok(c.query_row("SELECT v FROM t", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(v, "kept");
        assert!(
            db.vacuum_into(&dest)
                .unwrap_err()
                .message
                .contains("already exists")
        );
    }

    #[test]
    fn sizes_count_pages_and_the_log_and_reclaimable_pages() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(&dir.path().join("a.db"), &two()).unwrap();
        db.write_blocking(|tx| {
            for i in 0..200 {
                tx.execute("INSERT INTO t (v) VALUES (?1)", [format!("{i:0>200}")])?;
            }
            Ok(())
        })
        .unwrap();
        let before = db.sizes().unwrap();
        assert!(before.db_bytes > 0 && before.total() >= before.db_bytes);
        db.write_blocking(|tx| Ok(tx.execute("DELETE FROM t", [])?))
            .unwrap();
        db.checkpoint().unwrap();
        let after = db.sizes().unwrap();
        assert_eq!(after.wal_bytes, 0, "checkpoint(TRUNCATE) empties the log");
        assert!(
            after.reclaimable_bytes > 0,
            "deleted pages wait on the freelist"
        );
        db.vacuum_blocking().unwrap();
        assert_eq!(db.sizes().unwrap().reclaimable_bytes, 0);
    }
}
