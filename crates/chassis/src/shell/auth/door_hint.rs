//! The API door's 401 remedy, in the app's own words.
//!
//! The fixed remedy ("send Authorization: Bearer <client token>, or log in
//! on /login") addresses a person at a dashboard. A request that carries an
//! `Authorization` header comes from a program whose token is unknown, so
//! its remedy names the app's vocabulary and the page that issues tokens.
//! The hint rides as a request extension (set by `app_dashboard`), so the
//! public `AuthState` and `require_caller` signatures stay unchanged.

use axum::http::{HeaderMap, header};

/// What a program sees when its token is unknown; derived from the
/// vocabulary and the clients page label at mount.
#[derive(Clone, Debug)]
pub(crate) struct DoorHint {
    /// The full remedy for a request that sent an `Authorization` header.
    pub(crate) program_remedy: String,
}

impl DoorHint {
    /// `singular` is the vocabulary word ("source"); `page_label` and
    /// `page_path` name the page that issues tokens ("Sources", "/clients").
    pub(crate) fn new(singular: &str, page_label: &str, page_path: &str) -> Self {
        Self {
            program_remedy: format!(
                "send the token issued for this {singular} on the {page_label} page ({page_path}), as Authorization: Bearer <token>"
            ),
        }
    }
}

/// Today's remedy, for a person or a program that sent nothing.
pub(crate) const DEFAULT_REMEDY: &str =
    "send Authorization: Bearer <client token>, or log in on /login";

/// Pick the remedy: the vocabulary-aware one when a token was sent.
pub(crate) fn remedy_for(hint: Option<&DoorHint>, headers: &HeaderMap) -> String {
    match hint {
        Some(h) if headers.contains_key(header::AUTHORIZATION) => h.program_remedy.clone(),
        _ => DEFAULT_REMEDY.to_string(),
    }
}
