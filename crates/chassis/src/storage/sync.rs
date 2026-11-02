//! The server half of the local database (feat-localdb-1, decisions 1 to 5,
//! 8 and 10 of `docs/LOCAL_DB_DESIGN.md`): collections declared in Rust, a
//! change log written in the same transaction as the app's own change, and
//! a feed per collection that a page pulls "what changed since last time"
//! from.
//!
//! The pieces, from the declaration to the wire:
//!
//! - [`SyncCollection`]: what is synced (name, key, indexes, scope, retention).
//! - [`SyncWrite`]: `tx.sync_upsert` / `tx.sync_delete` on the write
//!   transaction; the rows of the `chassis_sync` table.
//! - [`SyncSource`]: the port the feed reads through. [`SqliteChangeLog`] is
//!   the adapter over the change log; [`SyncLoad`] is the app's half of it
//!   (current bodies of the keys that changed).
//! - [`SyncService`]: the manifest and the pages, with the 410 floor check.
//! - [`check_create`] / [`client_key`]: the rules for an item created on the
//!   device under its final id (decision 8).

#[cfg(feature = "dashboard")]
mod api;
mod collection;
mod create_rules;
mod cursor;
mod ddl;
mod feed;
#[cfg(feature = "live")]
mod hint;
mod log;
mod retention;
mod service;
mod tx;

#[cfg(any(test, feature = "testing"))]
pub mod conformance;
#[cfg(test)]
mod tests;

#[cfg(feature = "dashboard")]
pub(crate) use api::routes;
pub use collection::{MAX_PAGE_LIMIT, SyncCollection};
pub use create_rules::{CreateVerdict, KeyExists, check_create, client_key};
pub use cursor::Cursor;
pub(crate) use ddl::SYNC_DDL;
pub use feed::{Delete, Feed, Page, Upsert};
#[cfg(feature = "live")]
pub use hint::publish_hint;
pub use log::{SqliteChangeLog, SyncFuture, SyncLoad, SyncSource};
pub(crate) use retention::RetentionPlan;
pub use service::SyncService;
pub use tx::SyncWrite;
