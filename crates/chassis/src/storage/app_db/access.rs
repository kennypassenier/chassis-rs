//! Reading and writing the open app database: the handle's connection, its path
//! and the sync and async read/write entry points, plus the file copy and
//! sizes.

use std::path::Path;

use rusqlite::{Connection, Transaction};

use super::AppDb;
use crate::core::error::Error;
use crate::storage::db::{Db, FileSizes};

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
}
