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

use serde::{Deserialize, Serialize};

use crate::core::crypto::ct_eq;
use crate::core::error::{Error, Kind};

/// Store format version for the decrypted JSON. A reader accepts this
/// version and the one before it (K21); bump with a migration.
pub const CLIENTS_FORMAT: u32 = 1;

/// Length of a freshly issued token: 32 random bytes as 64 hex chars.
pub const TOKEN_BYTES: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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

    /// Issue a token for a new name. `id` and `token` come from the
    /// shell's random source, `now` from its clock.
    pub fn issue(
        &mut self,
        name: &str,
        id: String,
        token: String,
        now: &str,
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
        });
        Ok(self.clients.last().expect("just pushed"))
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
mod tests {
    use super::*;

    const T0: &str = "2026-09-05T07:00:00Z";
    const T1: &str = "2026-09-05T07:05:00Z";

    #[test]
    fn issue_reissue_revoke_delete_lifecycle() {
        let mut f = ClientsFile::default();
        f.issue("home-assistant", "id-1".into(), "tok-a".into(), T0)
            .unwrap();
        // Same active name is refused with a remedy naming re-issue.
        let err = f
            .issue("home-assistant", "id-2".into(), "tok-b".into(), T0)
            .unwrap_err();
        assert!(err.remedy.contains("re-issue"));
        assert_eq!(f.by_token("tok-a").unwrap().name, "home-assistant");

        f.reissue("id-1", "tok-c".into(), T1).unwrap();
        assert!(
            f.by_token("tok-a").is_none(),
            "the old token stops working at once"
        );
        assert!(f.by_token("tok-c").is_some());

        f.revoke("id-1", T1).unwrap();
        assert!(
            f.by_token("tok-c").is_none(),
            "a revoked token is refused within the same call"
        );
        assert_eq!(f.get("id-1").unwrap().revoked_at.as_deref(), Some(T1));
        // The name is free again, the row stays.
        f.issue("home-assistant", "id-2".into(), "tok-d".into(), T1)
            .unwrap();
        assert_eq!(f.clients.len(), 2);
        // Re-issuing a revoked row is refused.
        assert!(f.reissue("id-1", "x".into(), T1).is_err());

        let gone = f.delete("id-1").unwrap();
        assert_eq!(gone.id, "id-1");
        assert!(f.delete("id-1").is_err());
    }

    #[test]
    fn names_are_validated() {
        assert!(validate_name("ok.name-1_").is_ok());
        assert!(validate_name("").is_err());
        assert!(validate_name("has space").is_err());
        assert!(validate_name(&"a".repeat(65)).is_err());
    }

    #[test]
    fn touch_moves_last_used_and_counts() {
        let mut f = ClientsFile::default();
        f.issue("n", "id".into(), "t".into(), T0).unwrap();
        assert!(f.get("id").unwrap().last_used_at.is_none());
        f.touch("id", T1);
        f.touch("id", T1);
        let c = f.get("id").unwrap();
        assert_eq!(c.last_used_at.as_deref(), Some(T1));
        assert_eq!(c.uses, 2);
    }

    #[test]
    fn format_check_accepts_current_and_previous_only() {
        let mut f = ClientsFile::default();
        assert!(f.check_format().is_ok(), "current format");
        f.v = CLIENTS_FORMAT - 1;
        assert!(
            f.check_format().is_ok(),
            "K21: build N reads a store written by N-1"
        );
        f.v = CLIENTS_FORMAT + 1;
        let err = f.check_format().unwrap_err();
        assert!(
            err.remedy.contains("pre-update copy"),
            "a newer store is refused with the copy as remedy: {}",
            err.remedy
        );
        f.v = CLIENTS_FORMAT + 7;
        assert!(f.check_format().is_err());
    }
}
