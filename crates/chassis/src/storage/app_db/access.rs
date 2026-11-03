//! Reading and writing the open app database: the handle's connection, its path
//! and the sync and async read/write entry points, plus the file copy and
//! sizes.

use std::path::Path;
use std::sync::Arc;

use rusqlite::{Connection, Transaction};

use super::AppDb;
use crate::core::error::Error;
use crate::storage::db::{Db, FileSizes};
use crate::storage::sync::{SyncCollection, flush_marks, install_triggers};

impl AppDb {
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

    /// Run `f` in the write transaction. For the collections declared with
    /// [`SyncCollection::table`], the changes `f` made (also the ones SQL
    /// made by itself) are recorded in the change log before the commit.
    pub async fn write<T, F>(&self, f: F) -> Result<T, Error>
    where
        T: Send + 'static,
        F: FnOnce(&Transaction) -> Result<T, Error> + Send + 'static,
    {
        let tracked = self.shared.tracked.get().cloned();
        self.db()?.write(move |tx| flushing(tx, tracked, f)).await
    }

    pub fn read_blocking<T>(
        &self,
        f: impl FnOnce(&Connection) -> Result<T, Error>,
    ) -> Result<T, Error> {
        self.db()?.read_blocking(f)
    }

    /// As [`AppDb::write`], blocking.
    pub fn write_blocking<T>(
        &self,
        f: impl FnOnce(&Transaction) -> Result<T, Error>,
    ) -> Result<T, Error> {
        let tracked = self.shared.tracked.get().cloned();
        self.db()?
            .write_blocking(move |tx| flushing(tx, tracked, f))
    }

    /// Install the triggers of the collections declared with
    /// [`SyncCollection::table`], record the rows that exist already (once
    /// per file) and flush their marks in every later write. The app does
    /// this by itself at start (`App::sync_collection`); call it for a
    /// handle opened directly in a test. Calling it twice is an error.
    pub fn track_sync_tables(&self, collections: &[SyncCollection]) -> Result<(), Error> {
        let tracked: Vec<SyncCollection> = collections
            .iter()
            .filter(|c| c.is_tracked())
            .cloned()
            .collect();
        if tracked.is_empty() {
            return Ok(());
        }
        self.write_blocking(|tx| install_triggers(tx, &tracked))?;
        self.shared
            .tracked
            .set(Arc::new(tracked))
            .map_err(|_| Error::internal("the sync tables were tracked twice", "declare them once"))
    }

    /// A consistent copy of the app's file (`VACUUM INTO`).
    pub fn vacuum_into(&self, dest: &Path) -> Result<u64, Error> {
        self.db()?.vacuum_into(dest)
    }

    pub fn sizes(&self) -> Result<FileSizes, Error> {
        self.db()?.sizes()
    }
}

/// Run the app's closure, then turn the marks of the triggers into the
/// change log, in the same transaction.
fn flushing<T>(
    tx: &Transaction,
    tracked: Option<Arc<Vec<SyncCollection>>>,
    f: impl FnOnce(&Transaction) -> Result<T, Error>,
) -> Result<T, Error> {
    let out = f(tx)?;
    if let Some(collections) = tracked {
        flush_marks(tx, &collections)?;
    }
    Ok(out)
}
