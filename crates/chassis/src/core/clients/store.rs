//! The operations on the clients file: issuing, re-issuing, revoking and
//! deleting a client, and finding one by token, id or name. Pure: the caller
//! supplies the id, token and clock.

use super::{CLIENTS_FORMAT, Client, ClientsFile, SCOPE_FIELD, validate_name};
use crate::core::crypto::ct_eq;
use crate::core::error::{Error, Kind};
use std::collections::BTreeMap;

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
