//! How a [`Db`](super::Db) is opened beyond its path and schema: the size and
//! kind of the read pool and the copies kept before a migration. Its own
//! module because these are choices a project makes once (kyu, 2026-11-01:
//! four read-write readers and a copy before every schema change), with
//! defaults that keep `Db::open` exactly as it was.

use crate::core::error::Error;

use super::READERS;

/// The most readers a pool may have: each is an open file handle and a
/// page cache, and more than this only queues on the one writer anyway.
pub const MAX_READERS: usize = 16;

/// Options for [`Db::open_with`](super::Db::open_with). The default is what
/// [`Db::open`](super::Db::open) does: [`READERS`] read-only readers and no
/// pre-migration copies.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DbOptions {
    pub(super) readers: usize,
    pub(super) writable_readers: bool,
    pub(super) keep_snapshots: usize,
}

impl Default for DbOptions {
    fn default() -> Self {
        DbOptions::new()
    }
}

impl DbOptions {
    /// [`READERS`] read-only readers, no pre-migration copies.
    pub fn new() -> Self {
        DbOptions {
            readers: READERS,
            writable_readers: false,
            keep_snapshots: 0,
        }
    }

    /// How many reader connections the pool holds (0 reads on the writer).
    /// At most [`MAX_READERS`]; checked when the file opens.
    pub fn readers(mut self, count: usize) -> Self {
        self.readers = count;
        self
    }

    /// Open the readers read-write instead of read-only, for a project whose
    /// "reads" touch temporary tables or run their own short transactions.
    /// Writes still belong on [`Db::write`](super::Db::write): only the
    /// writer takes the backup ticket.
    pub fn writable_readers(mut self) -> Self {
        self.writable_readers = true;
        self
    }

    /// Before migrating an existing file, copy it to
    /// `<stem>.pre-v<N>.db` beside it (N the schema it had), keeping the
    /// newest `count` copies. A failed copy refuses the migration, so a bad
    /// upgrade always has its way back. 0 (the default) keeps none.
    pub fn pre_migration_snapshots(mut self, count: usize) -> Self {
        self.keep_snapshots = count;
        self
    }

    pub(super) fn validate(&self) -> Result<(), Error> {
        if self.readers > MAX_READERS {
            return Err(Error::config(
                format!("a database pool of {} readers was asked for", self.readers),
                format!("use at most {MAX_READERS}; more only queue behind the one writer"),
            ));
        }
        Ok(())
    }
}
