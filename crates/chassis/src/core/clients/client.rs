//! Building a `Client` from outside the kit and reading its scope.

use super::{Client, SCOPE_FIELD};

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
