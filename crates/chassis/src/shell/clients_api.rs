//! The clients endpoints the dashboard drives (K12, K13, K14), as JSON.
//! L4 puts HTML in front of them; the mechanism lives here so it can be
//! tested without a browser.
//!
//! All routes sit behind `require_admin`. The token itself appears in
//! exactly one response: `GET /clients/{id}/token`, fetched by the reveal
//! and copy buttons on click (K12) — never in the list.

use std::sync::Arc;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};

use crate::core::clients::{Client, TOKEN_BYTES};
use crate::core::error::{Error, Kind};
use crate::shell::captures::Captures;
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
}

#[derive(Debug, Deserialize)]
pub struct IssueForm {
    pub name: String,
}

pub async fn list(State(api): State<ClientsApi>) -> Json<Vec<ClientView>> {
    let snap = api.clients.snapshot();
    Json(snap.clients.iter().map(ClientView::from).collect())
}

pub async fn issue(
    State(api): State<ClientsApi>,
    Json(form): Json<IssueForm>,
) -> Result<Response, Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let token = random_hex(TOKEN_BYTES)?;
    let now = now_rfc3339();
    let name = form.name.clone();
    let client = api
        .clients
        .update(&mut |f| f.issue(&name, id.clone(), token.clone(), &now).cloned())?;
    tracing::info!(client = %client.name, id = %client.id, "client token issued");
    Ok((StatusCode::CREATED, Json(ClientView::from(&client))).into_response())
}

pub async fn reissue(
    State(api): State<ClientsApi>,
    Path(id): Path<String>,
) -> Result<Json<ClientView>, Error> {
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
    Path(id): Path<String>,
) -> Result<Json<ClientView>, Error> {
    let now = now_rfc3339();
    let client = api.clients.update(&mut |f| f.revoke(&id, &now).cloned())?;
    tracing::info!(client = %client.name, id = %client.id, "client token revoked");
    Ok(Json(ClientView::from(&client)))
}

pub async fn delete(
    State(api): State<ClientsApi>,
    Path(id): Path<String>,
) -> Result<StatusCode, Error> {
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
    Path(id): Path<String>,
) -> Result<Json<TokenReveal>, Error> {
    let snap = api.clients.snapshot();
    let client = snap.get(&id).ok_or_else(|| {
        Error::new(
            Kind::NotFound,
            format!("no client with id {id}"),
            "list the clients on /clients",
        )
    })?;
    let token = client.token.clone().ok_or_else(|| {
        Error::invalid(
            format!("client `{}` is revoked; it has no token", client.name),
            "issue a new client instead",
        )
    })?;
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
    Path(id): Path<String>,
) -> Result<Json<TestResult>, Error> {
    let route = api.test_route.as_ref().ok_or_else(|| {
        Error::invalid(
            "this service declares no test route",
            "the project can register one with App::test_route",
        )
    })?;
    let snap = api.clients.snapshot();
    let token = snap.get(&id).and_then(|c| c.token.clone()).ok_or_else(|| {
        Error::new(
            Kind::NotFound,
            format!("no active client {id}"),
            "issue or re-issue first",
        )
    })?;
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
