//! The per-client actions: re-issue, revoke, delete and reveal.

use axum::Json;
use axum::extract::{Extension, Path, State};
use axum::http::StatusCode;

use super::lookup::{lookup, revoked};
use super::{ClientView, ClientsApi, TokenReveal, command_template, token_placeholder};
use crate::core::clients::TOKEN_BYTES;
use crate::core::error::Error;
use crate::shell::dashboard::Vocabulary;
use crate::shell::time::{now_rfc3339, random_hex};

/// Body of [`super::reissue`].
pub(super) async fn reissue(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Path(id): Path<String>,
) -> Result<Json<ClientView>, Error> {
    lookup(&api, &vocab, &id, true)?;
    let token = random_hex(TOKEN_BYTES)?;
    let now = now_rfc3339();
    let client = api
        .clients
        .update(&mut |f| f.reissue(&id, token.clone(), &now).cloned())?;
    tracing::info!(client = %client.name, id = %client.id, "client token re-issued");
    Ok(Json(ClientView::from(&client)))
}

/// Body of [`super::revoke`].
pub(super) async fn revoke(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Path(id): Path<String>,
) -> Result<Json<ClientView>, Error> {
    lookup(&api, &vocab, &id, true)?;
    let now = now_rfc3339();
    let client = api.clients.update(&mut |f| f.revoke(&id, &now).cloned())?;
    tracing::info!(client = %client.name, id = %client.id, "client token revoked");
    Ok(Json(ClientView::from(&client)))
}

/// Body of [`super::delete`].
pub(super) async fn delete(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Path(id): Path<String>,
) -> Result<StatusCode, Error> {
    let client = lookup(&api, &vocab, &id, false)?;
    if let Some(hook) = &api.on_deleted {
        hook(&ClientView::from(&client))?;
    }
    let client = api.clients.update(&mut |f| f.delete(&id))?;
    api.captures.forget(&id);
    tracing::info!(client = %client.name, id = %client.id, "client deleted");
    Ok(StatusCode::NO_CONTENT)
}

/// Body of [`super::reveal`].
pub(super) async fn reveal(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Path(id): Path<String>,
) -> Result<Json<TokenReveal>, Error> {
    let client = lookup(&api, &vocab, &id, true)?;
    let token = client.token.clone().ok_or_else(|| revoked(&vocab, &id))?;
    let command = command_template(
        &api.self_base_url,
        api.test_route.as_ref().map(|t| t.path.as_str()),
        &vocab,
    )
    .replace(&token_placeholder(&vocab), &token);
    Ok(Json(TokenReveal { token, command }))
}
