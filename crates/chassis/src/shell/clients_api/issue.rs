//! Issuing a client token: validation, the project's hook, then the store.

use std::collections::BTreeMap;

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use super::{ClientView, ClientsApi, IssueForm};
use crate::core::clients::TOKEN_BYTES;
use crate::core::error::Error;
use crate::shell::dashboard::Vocabulary;
use crate::shell::time::{now_rfc3339, random_hex};

/// Issue one client: check the name, ask the project's hook, store it.
pub(super) async fn issue_inner(
    api: ClientsApi,
    vocab: Vocabulary,
    article: &str,
    form: IssueForm,
) -> Result<Response, Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let token = random_hex(TOKEN_BYTES)?;
    let now = now_rfc3339();
    let name = form.name.clone();
    ensure_issuable(&api, &vocab, article, &name)?;
    // The project's hook runs before the token exists, so a refusal issues
    // nothing.
    if let Some(hook) = &api.on_issued {
        let provisional = ClientView {
            id: id.clone(),
            name: name.clone(),
            active: true,
            issued_at: now.clone(),
            revoked_at: None,
            last_used_at: None,
            uses: 0,
            fields: form.fields.clone(),
        };
        hook(&provisional, &form.fields)?;
    }
    // Only declared names reach the store; the hook above saw everything.
    let stored: BTreeMap<String, String> = api
        .declared_fields
        .iter()
        .filter_map(|name| form.fields.get(name).map(|v| (name.clone(), v.clone())))
        .collect();
    let client = api.clients.update(&mut |f| {
        f.issue_with_fields(&name, id.clone(), token.clone(), &now, stored.clone())
            .cloned()
    })?;
    tracing::info!(client = %client.name, id = %client.id, "client token issued");
    Ok((StatusCode::CREATED, Json(ClientView::from(&client))).into_response())
}

/// The refusals that come before the project's hook: a name the store would
/// refuse, and a name that already has a token.
fn ensure_issuable(
    api: &ClientsApi,
    vocab: &Vocabulary,
    article: &str,
    name: &str,
) -> Result<(), Error> {
    // Checked here, before the store and before the project's hook: the
    // hook must not see a name the store would refuse, and the refusal
    // must speak the project's vocabulary.
    crate::core::clients::validate_name(name).map_err(|e| {
        Error::invalid(
            format!("{} name `{name}` is not allowed", vocab.singular),
            e.remedy,
        )
    })?;
    if api
        .clients
        .snapshot()
        .clients
        .iter()
        .any(|c| c.name == name && c.token.is_some())
    {
        return Err(Error::invalid(
            format!(
                "{} {} named `{name}` already has a token",
                article, vocab.singular
            ),
            format!(
                "re-issue that {}'s token instead, or revoke it first to free the name",
                vocab.singular
            ),
        ));
    }
    Ok(())
}
