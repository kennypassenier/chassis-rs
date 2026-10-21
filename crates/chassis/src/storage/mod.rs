//! SQLite storage for a service (3.11.0): the kit's own file, the app's
//! file, a size budget that only warns, and targeted delete controls.
//!
//! Two files live in the state directory: `<name>-kit.db` holds what the
//! kit keeps for itself (clients, sessions, passkeys; secrets sealed per
//! field) and is never touched by cleanup, vacuum or delete; `<name>.db`
//! is the app's, opened through [`crate::App::app_db`]. The design and
//! Kenny's decisions are in `docs/STORAGE_DESIGN.md`.

mod db;

pub use db::{Db, FileSizes, Inspection, Migration, meta_get, meta_set, wal_path};

/// The sqlite crate the handles are built on, re-exported so a project
/// writes its queries against the very version the kit links.
pub use rusqlite;
