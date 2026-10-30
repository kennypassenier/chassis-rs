//! The clients model (K12, AR5): who may call this service, with which
//! token, and what happened to that token.
//!
//! A client is a name and a token. The token is stored **encrypted, not
//! hashed**, because the dashboard must be able to reveal and copy it
//! (K12); the whole file is sealed by `core::crypto`, so nothing in this
//! module is secret at rest. Revoking keeps the row (with `revoked_at`)
//! and frees the name; deleting removes the row. Everything here is a
//! pure transformation of `ClientsFile`; the shell owns time, randomness
//! and the disk.

mod client;
mod store;

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::core::error::Error;

/// Store format version for the decrypted JSON. A reader accepts this
/// version and the one before it (K21); bump with a migration.
///
/// 2 (feat-clients-2, 2026-09-10) adds `fields` to a client. A version-1
/// file has no such key, so `serde`'s default fills an empty map and the
/// file reads unchanged — the migration is the absence of work, and the
/// test below pins that rather than trusting it.
pub const CLIENTS_FORMAT: u32 = 2;

/// homelab-shared-1: the name of the declared client field that carries a
/// client's scope. A project that declares `client_form_field("scope", ..)`
/// gets the value stored with the client already; [`Client::scope`] reads
/// it and [`ClientsFile::issue_scoped`] writes it without a form.
pub const SCOPE_FIELD: &str = "scope";

/// Length of a freshly issued token: 32 random bytes as 64 hex chars.
pub const TOKEN_BYTES: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
// 2.0.0: a consumer no longer writes this out field by field. Adding
// `fields` in 1.9.0 broke every literal construction of it — almanac and kyu
// both build one in their migration code, and the release chain refused with
// `error[E0063]: missing field 'fields'` (CF-15). A struct with public fields
// cannot grow without that happening, so the kit stops offering the shape and
// offers `Client::adopted` instead: whatever is added later gets a default
// here, and no caller has to know.
#[non_exhaustive]
pub struct Client {
    /// Stable id (UUIDv4 text), the key in URLs; the name may be reused
    /// after a revoke, the id never is.
    pub id: String,
    pub name: String,
    /// Hex token; `None` after revoke (the secret is gone from disk, the
    /// row stays as history).
    pub token: Option<String>,
    /// RFC 3339 timestamps, as text: the store is read by people too.
    pub issued_at: String,
    pub revoked_at: Option<String>,
    pub last_used_at: Option<String>,
    pub uses: u64,
    /// What the project asked for besides a name (feat-clients-2): the
    /// values of the fields it declared with `client_form_field`, by field
    /// name. The kit keeps them so a project does not need a store of its
    /// own for "which calendar does this client write to"; only declared
    /// names are ever written here, so a caller cannot grow the store.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub fields: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClientsFile {
    pub v: u32,
    pub clients: Vec<Client>,
}

impl Default for ClientsFile {
    fn default() -> Self {
        Self {
            v: CLIENTS_FORMAT,
            clients: Vec::new(),
        }
    }
}

/// Names: 1–64 chars of letters, digits, `-`, `_`, `.`; that is what fits
/// in a URL, a metric label and a curl command without quoting.
pub fn validate_name(name: &str) -> Result<(), Error> {
    let ok_len = (1..=64).contains(&name.len());
    let ok_chars = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if ok_len && ok_chars {
        Ok(())
    } else {
        Err(Error::invalid(
            format!("client name `{name}` is not allowed"),
            "use 1-64 letters, digits, '-', '_' or '.', e.g. home-assistant",
        ))
    }
}

#[cfg(test)]
mod tests;
