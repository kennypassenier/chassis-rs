//! Finding a client by id and the refusal for a revoked one, in the project's
//! vocabulary (K28). Its own module because every per-client route starts here.

use super::ClientsApi;
use crate::core::clients::Client;
use crate::core::error::{Error, Kind};
use crate::shell::dashboard::Vocabulary;

/// The client `id` names, or the refusal in the project's words (K28);
/// with `active` a revoked row is refused too. The store's own guards
/// stay underneath for a request that races a delete.
pub(super) fn lookup(
    api: &ClientsApi,
    vocab: &Vocabulary,
    id: &str,
    active: bool,
) -> Result<Client, Error> {
    let snap = api.clients.snapshot();
    let client = snap.get(id).cloned().ok_or_else(|| {
        Error::new(
            Kind::NotFound,
            format!("no {} with id {id}", vocab.singular),
            format!(
                "the list on the {} page is current; the id may have been deleted",
                vocab.plural
            ),
        )
    })?;
    if active && client.revoked_at.is_some() {
        return Err(revoked(vocab, id));
    }
    Ok(client)
}

pub(super) fn revoked(vocab: &Vocabulary, id: &str) -> Error {
    Error::invalid(
        format!("{} {id} is revoked; it has no token", vocab.singular),
        format!(
            "issue a new {} with that name instead; a revoked row is history",
            vocab.singular
        ),
    )
}
