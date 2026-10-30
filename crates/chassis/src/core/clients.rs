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

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::core::crypto::ct_eq;
use crate::core::error::{Error, Kind};

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

impl Client {
    /// Build a row from outside the kit — the shape a one-time migration
    /// needs when it converts a project's own store into this one, which is
    /// the only reason a consumer ever holds a `Client` it made itself.
    ///
    /// Everything the kit adds later gets its default here, so this signature
    /// does not grow and a new field never breaks a caller again. That is the
    /// whole point of the `#[non_exhaustive]` above it.
    pub fn adopted(
        id: impl Into<String>,
        name: impl Into<String>,
        token: impl Into<String>,
        issued_at: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            token: Some(token.into()),
            issued_at: issued_at.into(),
            revoked_at: None,
            last_used_at: None,
            uses: 0,
            fields: Default::default(),
        }
    }
}

impl Client {
    /// The scope this client was issued with (the `scope` field), `None`
    /// for a client issued without one. What a scope means is the
    /// project's: the kit stores and returns the text.
    pub fn scope(&self) -> Option<&str> {
        self.fields
            .get(SCOPE_FIELD)
            .map(String::as_str)
            .filter(|s| !s.is_empty())
    }

    /// Whether this client's scope is one of `allowed`. A client without a
    /// scope is allowed nothing, so adding scopes to a project later never
    /// widens an old client.
    pub fn has_scope_in(&self, allowed: &[&str]) -> bool {
        self.scope().is_some_and(|s| allowed.contains(&s))
    }
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

impl ClientsFile {
    /// Accept this format and the previous one (there is no previous one
    /// yet; the rule is in place so K21's test has something to hold).
    pub fn check_format(&self) -> Result<(), Error> {
        if self.v == CLIENTS_FORMAT || self.v + 1 == CLIENTS_FORMAT {
            Ok(())
        } else {
            Err(Error::config(
                format!(
                    "clients store is format {} but this build reads {}",
                    self.v, CLIENTS_FORMAT
                ),
                "this store was written by a newer chassis; restore the pre-update copy or upgrade",
            ))
        }
    }

    /// Issue a token for a new name, keeping the project's declared field
    /// values with it (feat-clients-2). `id` and `token` come from the
    /// shell's random source, `now` from its clock.
    pub fn issue_with_fields(
        &mut self,
        name: &str,
        id: String,
        token: String,
        now: &str,
        fields: BTreeMap<String, String>,
    ) -> Result<&Client, Error> {
        validate_name(name)?;
        if self.active_by_name(name).is_some() {
            return Err(Error::invalid(
                format!("a client named `{name}` already has a token"),
                "re-issue that client's token instead, or revoke it first to free the name",
            ));
        }
        self.clients.push(Client {
            id,
            name: name.to_string(),
            token: Some(token),
            issued_at: now.to_string(),
            revoked_at: None,
            last_used_at: None,
            uses: 0,
            fields,
        });
        Ok(self.clients.last().expect("just pushed"))
    }

    /// [`ClientsFile::issue_with_fields`] with the client's scope set in
    /// `fields["scope"]` (homelab-shared-1). An empty scope is refused: a
    /// scoped client with no scope would read as unscoped.
    pub fn issue_scoped(
        &mut self,
        name: &str,
        scope: &str,
        id: String,
        token: String,
        now: &str,
    ) -> Result<&Client, Error> {
        if scope.trim().is_empty() {
            return Err(Error::invalid(
                "a scoped client needs a scope",
                "pass the scope the token may act under, e.g. read, operate or all",
            ));
        }
        let mut fields = BTreeMap::new();
        fields.insert(SCOPE_FIELD.to_string(), scope.trim().to_string());
        self.issue_with_fields(name, id, token, now, fields)
    }

    /// [`ClientsFile::issue_with_fields`] with no fields.
    ///
    /// Kept beside the new shape (feat-api-2, the first time that rule is
    /// used): a consumer calling this still compiles and is told where to
    /// go. It goes at 3.0.0 and not before — the recorded surface is a
    /// contract frozen for the life of a major, so removing it in a minor
    /// would break the promise the contract makes. The row that says so is
    /// in `docs/REMOVALS.md`, and the release refuses a deprecation that is
    /// missing there.
    ///
    /// `since` says 2.0.0 because 1.9.0 was never released: the chain
    /// refused it as a mislabelled minor and it went out as the major.
    #[deprecated(
        since = "2.0.0",
        note = "use issue_with_fields; a client now carries the project's declared fields"
    )]
    pub fn issue(
        &mut self,
        name: &str,
        id: String,
        token: String,
        now: &str,
    ) -> Result<&Client, Error> {
        self.issue_with_fields(name, id, token, now, BTreeMap::new())
    }

    /// Replace the token of an active client (the old one stops working
    /// at once).
    pub fn reissue(&mut self, id: &str, token: String, now: &str) -> Result<&Client, Error> {
        let c = self.active_by_id_mut(id)?;
        c.token = Some(token);
        c.issued_at = now.to_string();
        Ok(c)
    }

    /// Revoke: the token is gone, the row stays, the name is free again.
    pub fn revoke(&mut self, id: &str, now: &str) -> Result<&Client, Error> {
        let c = self.active_by_id_mut(id)?;
        c.token = None;
        c.revoked_at = Some(now.to_string());
        Ok(c)
    }

    /// Delete the row entirely (active or revoked).
    pub fn delete(&mut self, id: &str) -> Result<Client, Error> {
        let pos = self
            .clients
            .iter()
            .position(|c| c.id == id)
            .ok_or_else(|| not_found(id))?;
        Ok(self.clients.remove(pos))
    }

    /// The active client whose token matches, compared in constant time
    /// against every active token so timing reveals nothing.
    pub fn by_token(&self, presented: &str) -> Option<&Client> {
        let mut found = None;
        for c in &self.clients {
            if let Some(t) = &c.token
                && ct_eq(t.as_bytes(), presented.as_bytes())
            {
                found = Some(c);
            }
        }
        found
    }

    /// Record a use (kept in memory by the shell, persisted debounced).
    pub fn touch(&mut self, id: &str, now: &str) {
        if let Some(c) = self.clients.iter_mut().find(|c| c.id == id) {
            c.last_used_at = Some(now.to_string());
            c.uses += 1;
        }
    }

    pub fn get(&self, id: &str) -> Option<&Client> {
        self.clients.iter().find(|c| c.id == id)
    }

    pub fn active_by_name(&self, name: &str) -> Option<&Client> {
        self.clients
            .iter()
            .find(|c| c.name == name && c.revoked_at.is_none())
    }

    fn active_by_id_mut(&mut self, id: &str) -> Result<&mut Client, Error> {
        let c = self
            .clients
            .iter_mut()
            .find(|c| c.id == id)
            .ok_or_else(|| not_found(id))?;
        if c.revoked_at.is_some() {
            return Err(Error::invalid(
                format!("client {id} is revoked"),
                "issue a new client with that name instead; a revoked row is history",
            ));
        }
        Ok(c)
    }
}

fn not_found(id: &str) -> Error {
    Error::new(
        Kind::NotFound,
        format!("no client with id {id}"),
        "list the clients on /clients; the id may have been deleted",
    )
}

#[cfg(test)]
mod tests;
