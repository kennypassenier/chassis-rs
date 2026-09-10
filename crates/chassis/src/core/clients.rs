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
mod tests {
    /// feat-api-3 (2.0.0): the kit stops offering the shape of a `Client` and
    /// offers a way to make one, so a field added later cannot break a
    /// consumer's build the way `fields` did in 1.9.0 (CF-15).
    ///
    /// `#[non_exhaustive]` itself cannot be asserted from inside this crate —
    /// it only restricts other crates — so what this proves is the half that
    /// is testable here: the constructor fills every field, including the one
    /// that caused the break, and a row it makes round-trips through the
    /// store. Made to fail first by having `adopted` leave `uses` at 1.
    #[test]
    fn feat_api_3_adopted_fills_every_field_and_survives_the_store() {
        let c = Client::adopted("source-weather", "weather", "t0ken", "2026-09-10T02:16:47Z");
        assert_eq!(c.id, "source-weather");
        assert_eq!(c.name, "weather");
        assert_eq!(c.token.as_deref(), Some("t0ken"));
        assert_eq!(c.issued_at, "2026-09-10T02:16:47Z");
        assert_eq!(c.revoked_at, None);
        assert_eq!(c.last_used_at, None);
        assert_eq!(c.uses, 0);
        assert!(
            c.fields.is_empty(),
            "the field that broke 1.9.0 has a default"
        );

        let file = ClientsFile {
            clients: vec![c.clone()],
            ..Default::default()
        };
        let text = serde_json::to_string(&file).expect("serialise");
        let back: ClientsFile = serde_json::from_str(&text).expect("read back");
        assert_eq!(back.clients, vec![c]);
    }

    use super::*;

    const T0: &str = "2026-09-05T07:00:00Z";
    const T1: &str = "2026-09-05T07:05:00Z";

    #[test]
    fn issue_reissue_revoke_delete_lifecycle() {
        let mut f = ClientsFile::default();
        f.issue_with_fields(
            "home-assistant",
            "id-1".into(),
            "tok-a".into(),
            T0,
            Default::default(),
        )
        .unwrap();
        // Same active name is refused with a remedy naming re-issue.
        let err = f
            .issue_with_fields(
                "home-assistant",
                "id-2".into(),
                "tok-b".into(),
                T0,
                Default::default(),
            )
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
        f.issue_with_fields(
            "home-assistant",
            "id-2".into(),
            "tok-d".into(),
            T1,
            Default::default(),
        )
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
        f.issue_with_fields("n", "id".into(), "t".into(), T0, Default::default())
            .unwrap();
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
    /// feat-clients-2: a store written by 1.8.0 has no `fields` key at all.
    /// It must read, and every client must come back with an empty map —
    /// that is the whole migration, so it is pinned rather than trusted.
    /// Drilled red by removing `#[serde(default …)]` from the field: the
    /// parse then failed with "missing field `fields`".
    #[test]
    fn feat_clients_2_a_version_1_store_reads_and_has_no_fields() {
        let v1 = r#"{"v":1,"clients":[{"id":"id-1","name":"home-assistant",
            "token":"tok","issued_at":"2026-01-01T00:00:00Z","revoked_at":null,
            "last_used_at":null,"uses":3}]}"#;
        let f: ClientsFile = serde_json::from_str(v1).expect("a 1.8.0 store still reads");
        assert_eq!(f.v, 1);
        assert!(f.check_format().is_ok(), "the previous format is accepted");
        assert!(
            f.clients[0].fields.is_empty(),
            "a client from before this version carries no fields"
        );
    }

    /// feat-clients-2: what the project declared is kept with the client and
    /// survives a write and a read. Drilled red by dropping `fields` from
    /// the pushed `Client`: the value came back empty.
    #[test]
    fn feat_clients_2_declared_fields_survive_the_round_trip() {
        let mut f = ClientsFile::default();
        assert_eq!(f.v, 2, "a fresh store is written in the current format");
        let mut fields = BTreeMap::new();
        fields.insert("calendar".to_string(), "work-cal".to_string());
        f.issue_with_fields("almanac", "id-1".into(), "tok".into(), T0, fields)
            .unwrap();
        let text = serde_json::to_string(&f).unwrap();
        let back: ClientsFile = serde_json::from_str(&text).unwrap();
        assert_eq!(
            back.clients[0].fields.get("calendar").map(String::as_str),
            Some("work-cal")
        );
        let empty = ClientsFile::default();
        assert!(
            !serde_json::to_string(&empty).unwrap().contains("fields"),
            "an empty map is not written, so a project without fields sees no change"
        );
    }

    /// feat-api-2, used for the first time: the shape this version replaces
    /// still works for one version. Drilled red by making the wrapper
    /// `unimplemented!()`.
    #[test]
    #[allow(deprecated)]
    fn feat_api_2_the_previous_issue_still_works_for_one_version() {
        let mut f = ClientsFile::default();
        let c = f
            .issue("kyu-runner", "id-1".into(), "tok".into(), T0)
            .expect("the previous shape still issues");
        assert!(c.fields.is_empty(), "and it issues without fields");
    }
}
