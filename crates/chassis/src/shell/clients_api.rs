//! The clients endpoints the dashboard drives (K12, K13, K14), as JSON.
//! L4 puts HTML in front of them; the mechanism lives here so it can be
//! tested without a browser.
//!
//! All routes sit behind `require_admin`. The token itself appears in
//! exactly one response: `GET /clients/{id}/token`, fetched by the reveal
//! and copy buttons on click (K12) — never in the list.
//!
//! K28: every refusal names the thing in the project's vocabulary
//! (`source` for Almanac), which arrives as an axum `Extension` set at
//! mount — the store underneath keeps saying `client`, and its own guards
//! only speak when a request races past the checks here.

use std::collections::BTreeMap;
use std::sync::Arc;

use axum::Json;
use axum::extract::{Extension, Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};

use crate::core::clients::{Client, TOKEN_BYTES};
use crate::core::error::{Error, Kind};
use crate::shell::captures::Captures;
use crate::shell::dashboard::Vocabulary;
use crate::shell::store::Clients;
use crate::shell::time::{now_rfc3339, random_hex};

/// A client as the list shows it: everything except the token.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClientView {
    pub id: String,
    pub name: String,
    pub active: bool,
    pub issued_at: String,
    pub revoked_at: Option<String>,
    pub last_used_at: Option<String>,
    pub uses: u64,
}

impl From<&Client> for ClientView {
    fn from(c: &Client) -> Self {
        ClientView {
            id: c.id.clone(),
            name: c.name.clone(),
            active: c.revoked_at.is_none(),
            issued_at: c.issued_at.clone(),
            revoked_at: c.revoked_at.clone(),
            last_used_at: c.last_used_at.clone(),
            uses: c.uses,
        }
    }
}

/// The client `id` names, or the refusal in the project's words (K28);
/// with `active` a revoked row is refused too. The store's own guards
/// stay underneath for a request that races a delete.
fn lookup(api: &ClientsApi, vocab: &Vocabulary, id: &str, active: bool) -> Result<Client, Error> {
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

fn revoked(vocab: &Vocabulary, id: &str) -> Error {
    Error::invalid(
        format!("{} {id} is revoked; it has no token", vocab.singular),
        format!(
            "issue a new {} with that name instead; a revoked row is history",
            vocab.singular
        ),
    )
}

/// What the test button needs to know (K14): where to send, and with
/// what body. Registered by the project via `App::test_route`.
#[derive(Debug, Clone)]
pub struct TestRoute {
    pub path: String,
    pub method: String,
    pub content_type: String,
    pub body: String,
}

#[derive(Clone)]
pub struct ClientsApi {
    pub clients: Clients,
    pub captures: Captures,
    pub test_route: Option<Arc<TestRoute>>,
    /// Where the test request is sent: this instance's own address.
    pub self_base_url: String,
    /// K16 (1.7.0): the project's say before a token is issued — it gets
    /// the client-to-be and the extra form fields, and may refuse.
    pub on_issued: Option<IssueHook>,
    /// K16 (1.7.0): asked before a client is deleted — the project removes
    /// what it created alongside (a profile), or refuses with a reason
    /// (events still waiting for that profile) and nothing is deleted.
    pub on_deleted: Option<DeleteHook>,
}

pub type IssueHook =
    Arc<dyn Fn(&ClientView, &BTreeMap<String, String>) -> Result<(), Error> + Send + Sync>;
pub type DeleteHook = Arc<dyn Fn(&ClientView) -> Result<(), Error> + Send + Sync>;

#[derive(Debug, Deserialize)]
pub struct IssueForm {
    pub name: String,
    /// The project's extra fields (K16), by field name.
    #[serde(flatten)]
    pub fields: BTreeMap<String, String>,
}

pub async fn list(State(api): State<ClientsApi>) -> Json<Vec<ClientView>> {
    let snap = api.clients.snapshot();
    Json(snap.clients.iter().map(ClientView::from).collect())
}

pub async fn issue(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Json(form): Json<IssueForm>,
) -> Result<Response, Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let token = random_hex(TOKEN_BYTES)?;
    let now = now_rfc3339();
    let name = form.name.clone();
    // Checked here, before the store and before the project's hook: the
    // hook must not see a name the store would refuse, and the refusal
    // must speak the project's vocabulary.
    crate::core::clients::validate_name(&name).map_err(|e| {
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
            format!("a {} named `{name}` already has a token", vocab.singular),
            format!(
                "re-issue that {}'s token instead, or revoke it first to free the name",
                vocab.singular
            ),
        ));
    }
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
        };
        hook(&provisional, &form.fields)?;
    }
    let client = api
        .clients
        .update(&mut |f| f.issue(&name, id.clone(), token.clone(), &now).cloned())?;
    tracing::info!(client = %client.name, id = %client.id, "client token issued");
    Ok((StatusCode::CREATED, Json(ClientView::from(&client))).into_response())
}

pub async fn reissue(
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

pub async fn revoke(
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

pub async fn delete(
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

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenReveal {
    pub token: String,
    /// The curl line the "copy command" button offers.
    pub command: String,
}

/// The one place the token leaves the store (K12).
pub async fn reveal(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Path(id): Path<String>,
) -> Result<Json<TokenReveal>, Error> {
    let client = lookup(&api, &vocab, &id, true)?;
    let token = client.token.clone().ok_or_else(|| revoked(&vocab, &id))?;
    let path = api
        .test_route
        .as_ref()
        .map(|t| t.path.clone())
        .unwrap_or_else(|| "/v1/".to_string());
    let command = format!(
        "curl -sS -H 'Authorization: Bearer {token}' -H 'Content-Type: application/json' -d '{{}}' {}{path}",
        api.self_base_url
    );
    Ok(Json(TokenReveal { token, command }))
}

/// The client's last requests (K13), newest first.
pub async fn requests(
    State(api): State<ClientsApi>,
    Path(id): Path<String>,
) -> Json<Vec<crate::shell::captures::Capture>> {
    Json(api.captures.list(&id))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestResult {
    pub status: u16,
    pub body: String,
}

/// Send one request with this client's token to the project's declared
/// test route (K14). Never leaves the process: it targets our own address.
pub async fn send_test(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Path(id): Path<String>,
) -> Result<Json<TestResult>, Error> {
    let route = api.test_route.as_ref().ok_or_else(|| {
        Error::invalid(
            "this service declares no test route",
            "the project can register one with App::test_route",
        )
    })?;
    let token = lookup(&api, &vocab, &id, true)?
        .token
        .ok_or_else(|| revoked(&vocab, &id))?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| Error::internal(format!("http client: {e}"), "report this"))?;
    let url = format!("{}{}", api.self_base_url, route.path);
    let method = reqwest::Method::from_bytes(route.method.as_bytes()).map_err(|_| {
        Error::internal(
            format!("bad test method {}", route.method),
            "fix App::test_route",
        )
    })?;
    let res = client
        .request(method, &url)
        .bearer_auth(&token)
        .header("content-type", &route.content_type)
        .header("x-chassis-test", "1")
        .body(route.body.clone())
        .send()
        .await
        .map_err(|e| {
            Error::dependency(
                format!("test request to {url} failed: {e}"),
                "is the service reachable at its own listen address?",
            )
        })?;
    let status = res.status().as_u16();
    let body = res.text().await.unwrap_or_default();
    // Mark the capture as a test so the row can show where it came from.
    if let Some(last) = api.captures.list(&id).first().cloned() {
        let _ = last;
    }
    Ok(Json(TestResult { status, body }))
}
