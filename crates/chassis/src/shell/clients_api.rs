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

mod issue;
mod lookup;
mod test_send;
mod token_actions;

use std::collections::BTreeMap;
use std::sync::Arc;

use axum::Json;
use axum::extract::{Extension, Path, State};
use axum::http::StatusCode;
use axum::response::Response;
use serde::{Deserialize, Serialize};

use crate::core::clients::Client;
use crate::core::error::Error;
use crate::shell::captures::Captures;
use crate::shell::dashboard::Vocabulary;
use crate::shell::store::Clients;

/// kit-r4: the article before the vocabulary's singular ("an app").
#[derive(Clone)]
pub(crate) struct VocabArticle(pub(crate) std::sync::Arc<str>);

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
    /// feat-clients-2: the values of the fields the project declared, by
    /// field name. Empty for a project that declares none, so the shape of
    /// the answer does not change for those.
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub fields: BTreeMap<String, String>,
}

impl From<&Client> for ClientView {
    fn from(c: &Client) -> Self {
        ClientView {
            id: c.id.clone(),
            name: c.name.clone(),
            active: c.revoked_at.is_none(),
            fields: c.fields.clone(),
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
    /// K16 (1.7.0): the project's say before a token is issued — it gets
    /// the client-to-be and the extra form fields, and may refuse.
    pub on_issued: Option<IssueHook>,
    /// K16 (1.7.0): asked before a client is deleted — the project removes
    /// what it created alongside (a profile), or refuses with a reason
    /// (events still waiting for that profile) and nothing is deleted.
    pub on_deleted: Option<DeleteHook>,
    /// feat-clients-2: the field names the project declared with
    /// `client_form_field`. Only these are stored with a client, so a
    /// caller posting extra keys cannot grow the store — the hook still
    /// sees everything that was posted, which is what it refuses on.
    pub declared_fields: Arc<Vec<String>>,
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

/// Issue a client, the article taken from the vocabulary's sound. The kit
/// itself routes `issue_with_article`, which also honours the service's
/// override (kit-r4); this signature is part of the recorded surface.
pub async fn issue(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Json(form): Json<IssueForm>,
) -> Result<Response, Error> {
    let article = crate::shell::dashboard::article_for(&vocab.singular).to_string();
    issue::issue_inner(api, vocab, &article, form).await
}

pub(crate) async fn issue_with_article(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Extension(article): Extension<VocabArticle>,
    Json(form): Json<IssueForm>,
) -> Result<Response, Error> {
    issue::issue_inner(api, vocab, &article.0, form).await
}

pub async fn reissue(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Path(id): Path<String>,
) -> Result<Json<ClientView>, Error> {
    token_actions::reissue(State(api), Extension(vocab), Path(id)).await
}

pub async fn revoke(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Path(id): Path<String>,
) -> Result<Json<ClientView>, Error> {
    token_actions::revoke(State(api), Extension(vocab), Path(id)).await
}

pub async fn delete(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Path(id): Path<String>,
) -> Result<StatusCode, Error> {
    token_actions::delete(State(api), Extension(vocab), Path(id)).await
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenReveal {
    pub token: String,
    /// The curl line the "copy command" button offers.
    pub command: String,
}

/// What stands where the token goes in [`command_template`]: `$` and the
/// vocabulary's [`Vocabulary::token_var`] (`$SOURCE_TOKEN`).
pub(crate) fn token_placeholder(vocab: &Vocabulary) -> String {
    format!("${}", vocab.token_var())
}

/// The curl line a program is wired up with, the token replaced by
/// `$<WORD>_TOKEN` (kit-kp11; `CLIENT_TOKEN` unless the service names its
/// clients otherwise): safe to paste in a chat, and it works as it stands
/// once the shell has that variable set. The header is double-quoted so the
/// shell expands the variable; the token is hex, so the revealed line (this
/// template with the token in place) needs no escaping.
pub(crate) fn command_template(
    base_url: &str,
    test_path: Option<&str>,
    vocab: &Vocabulary,
) -> String {
    let placeholder = token_placeholder(vocab);
    format!(
        "curl -sS -H \"Authorization: Bearer {placeholder}\" -H 'Content-Type: application/json' -d '{{}}' {base_url}{}",
        test_path.unwrap_or("/v1/")
    )
}

/// The one place the token leaves the store (K12).
pub async fn reveal(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Path(id): Path<String>,
) -> Result<Json<TokenReveal>, Error> {
    token_actions::reveal(State(api), Extension(vocab), Path(id)).await
}

/// The client's last requests (K13), newest first.
pub async fn requests(
    State(api): State<ClientsApi>,
    Path(id): Path<String>,
) -> Json<Vec<crate::shell::captures::Capture>> {
    Json(api.captures.list(&id))
}

/// What the Test it field sends (kit-kp11, clients-manage): the body the
/// reader edited. Without one the request carries the route's own body.
#[derive(Debug, Default, Deserialize)]
pub(crate) struct TestRequest {
    pub(crate) body: Option<String>,
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
    send_test_body(State(api), Extension(vocab), Path(id), None).await
}

/// The route behind "Send test" (kit-kp11, clients-manage): like
/// [`send_test`], with the body the reader edited in the Test it field.
pub(crate) async fn send_test_body(
    State(api): State<ClientsApi>,
    Extension(vocab): Extension<Vocabulary>,
    Path(id): Path<String>,
    request: Option<Json<TestRequest>>,
) -> Result<Json<TestResult>, Error> {
    test_send::send(State(api), Extension(vocab), Path(id), request).await
}
