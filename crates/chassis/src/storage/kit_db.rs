//! The kit's own file, `<name>-kit.db`: clients, sessions and passkeys.
//!
//! These used to be three sealed JSON files (`clients.json.enc`,
//! `sessions.json.enc`, `passkeys.json.enc`). They live here now, one table
//! each, and the secrets stay sealed FIELD BY FIELD with the same crypto and
//! the same `<P>_SECRET_KEY`: a client's token and its declared field values,
//! a passkey's credential. Ids, names, timestamps and the SHA-256 of a
//! session cookie are not secrets and are plain columns, so the file can be
//! inspected without the key.
//!
//! This file is the kit's alone. Nothing here is reachable from the Storage
//! page: there is no kind for it, no delete and no compact (`AppDb` is a
//! different type, and `docs/STORAGE_DESIGN.md` decision 2 makes that the
//! rule). The only thing that removes rows from it is the kit itself, and
//! only sessions that expired by their own definition.
//!
//! The first start after the upgrade moves the old files in, once, in ONE
//! transaction ([`KitDb::import_legacy`]): a failure writes nothing and the
//! kit keeps running on the old files; a success verifies the counts and
//! renames the old files to `*.json.enc.migrated`.

use std::path::PathBuf;

use super::db::Db;
use crate::core::crypto::Key;

mod clients;
mod import;
mod passkeys;
mod rekey;
mod schema;
mod seal;
mod sessions;
#[cfg(test)]
mod tests;

pub(crate) use schema::{kit_file_name, kit_migrations, kit_schema_version};

/// One passkey as the table keeps it; the credential is the serialised
/// WebAuthn credential, sealed at rest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PasskeyRow {
    pub id: String,
    pub label: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
    pub credential_json: String,
}

/// What the one-time import should look at.
pub(crate) struct ImportPlan {
    pub state_dir: PathBuf,
    /// The kit builds the clients store itself (no project store, not open).
    pub clients: bool,
    /// `sessions.json.enc`, or `sessions.open.json.enc` for an open run.
    pub sessions_file: &'static str,
    /// The passkeys feature is compiled in and its page is on.
    pub passkeys: bool,
}

/// The kit's file with the key that seals its secrets.
#[derive(Clone)]
pub(crate) struct KitDb {
    db: Db,
    key: Key,
}

impl KitDb {
    pub(crate) fn new(db: Db, key: Key) -> Self {
        KitDb { db, key }
    }
}
