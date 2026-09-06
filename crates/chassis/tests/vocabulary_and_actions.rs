//! K28 (vocabulary) and K29 (row and section actions), in-process like
//! `client_form_hooks.rs`: an `App` on port 0 with generated secrets, a
//! login cookie, then the pages and the API over raw HTTP. Almanac is the
//! case throughout: its clients are "sources", its status section has a
//! "Reload profiles from disk" button, and a source's row gets a "Sync now".

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::post;
use chassis::shell::dashboard::{ClientAction, Section, SectionAction, StatusSection};
use chassis::{App, AppSpec, Error};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const TOKEN: &str = "a-login-token-that-is-long-enough";
const KEY: &str = "abababababababababababababababababababababababababababababababab";

fn env(dir: &std::path::Path) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    env.insert("VOCABDEMO_STATE_DIR".into(), dir.display().to_string());
    env.insert("VOCABDEMO_LISTEN".into(), "127.0.0.1:0".into());
    env.insert("VOCABDEMO_LOG".into(), "warn".into());
    env.insert("VOCABDEMO_TOKEN".into(), TOKEN.into());
    env.insert("VOCABDEMO_SECRET_KEY".into(), KEY.into());
    env.insert(
        "VOCABDEMO_PUBLIC_URL".into(),
        "https://vocabdemo.example.lan".into(),
    );
    env
}

fn app(dir: &std::path::Path, public: Router) -> App {
    App::from_args_with_env(
        AppSpec {
            name: "vocabdemo",
            version: "0.0.0",
            ..Default::default()
        },
        vec!["vocabdemo".into()],
        env(dir),
        public,
    )
    .unwrap()
}

/// One raw HTTP/1.1 request; returns (status, headers lowercased, body).
async fn http(
    addr: std::net::SocketAddr,
    method: &str,
    path: &str,
    extra: &[(&str, &str)],
    body: &str,
) -> (u16, String, String) {
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let mut request = format!("{method} {path} HTTP/1.1\r\nHost: {addr}\r\n");
    for (k, v) in extra {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str(&format!(
        "Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    ));
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).await.unwrap();
    let text = String::from_utf8_lossy(&raw).to_string();
    let status: u16 = text.split_whitespace().nth(1).unwrap().parse().unwrap();
    let mut parts = text.splitn(2, "\r\n\r\n");
    let headers = parts.next().unwrap_or_default().to_ascii_lowercase();
    let body = parts.next().unwrap_or_default().to_string();
    (status, headers, body)
}

async fn login(addr: std::net::SocketAddr) -> String {
    let (status, headers, _) = http(
        addr,
        "POST",
        "/login",
        &[("Content-Type", "application/x-www-form-urlencoded")],
        &format!("token={TOKEN}"),
    )
    .await;
    assert_eq!(status, 303);
    let line = headers
        .lines()
        .find(|l| l.starts_with("set-cookie:"))
        .expect("a session cookie");
    line["set-cookie:".len()..]
        .trim()
        .split(';')
        .next()
        .unwrap()
        .to_string()
}

async fn issue(addr: std::net::SocketAddr, cookie: &str, name: &str) -> (u16, String) {
    let (status, _, body) = http(
        addr,
        "POST",
        "/api/clients",
        &[("Content-Type", "application/json"), ("Cookie", cookie)],
        &format!(r#"{{"name":"{name}"}}"#),
    )
    .await;
    (status, body)
}

fn id_of(body: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(body).unwrap();
    v["id"].as_str().unwrap().to_string()
}

/// The text a reader sees: tags (attributes included) and comments gone.
fn visible_text(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' if in_tag => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

/// Whole-word, case-insensitive: `client` or `clients` as a word of its own.
fn says_client(text: &str) -> Option<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .map(|w| w.to_ascii_lowercase())
        .find(|w| w == "client" || w == "clients")
}

// K28: with `vocabulary("source", "sources")` no kit page says "client" any
// more, the heading defaults to the capitalised plural, and the API paths
// stay what they were. Drilled red once by putting the literal word back in
// one sentence of clients.html.
#[tokio::test]
async fn k28_the_pages_speak_the_vocabulary_and_never_say_client() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = app(dir.path(), Router::new());
    app.vocabulary("source", "sources");
    app.test_route("POST", "/v1/events", "application/json", "{}");
    let running = app.start().await.unwrap();
    let addr = running.addr;

    let (_, _, login_page) = http(addr, "GET", "/login", &[], "").await;
    assert_eq!(
        says_client(&visible_text(&login_page)),
        None,
        "{login_page}"
    );
    assert!(login_page.contains("source token on the Sources page"));

    let cookie = login(addr).await;
    let admin = [("Cookie", cookie.as_str())];

    let (_, _, empty) = http(addr, "GET", "/clients", &admin, "").await;
    let text = visible_text(&empty);
    assert_eq!(says_client(&text), None, "{empty}");
    assert!(empty.contains("<h1>Sources</h1>"), "{empty}");
    assert!(empty.contains("No sources yet. Add one above."), "{empty}");
    assert!(empty.contains("Add a source"), "{empty}");
    assert!(empty.contains("vocabdemo — sources</title>"), "{empty}");
    assert!(
        empty.contains(">Sources</a>") && !empty.contains("sources\""),
        "the nav label follows the vocabulary, the URL does not: {empty}"
    );

    let (status, body) = issue(addr, &cookie, "job-tracker").await;
    assert_eq!(status, 201, "{body}");
    let id = id_of(&body);
    let (_, _, full) = http(addr, "GET", "/clients", &admin, "").await;
    assert_eq!(says_client(&visible_text(&full)), None, "{full}");
    assert!(
        full.contains(&format!("data-post=\"/api/clients/{id}/revoke\"")),
        "API paths are not vocabulary: {full}"
    );
    assert!(
        full.contains("Delete this source and its history?"),
        "{full}"
    );

    let (_, _, status_page) = http(addr, "GET", "/", &admin, "").await;
    assert_eq!(
        says_client(&visible_text(&status_page)),
        None,
        "{status_page}"
    );
    running.stop().await;
}

// K28: the default is still `client`/`clients`, heading `Clients`.
// Drilled red once by flipping the expectation to "Sources".
#[tokio::test]
async fn k28_without_vocabulary_the_pages_still_say_client() {
    let dir = tempfile::tempdir().unwrap();
    let running = app(dir.path(), Router::new()).start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let (_, _, page) = http(addr, "GET", "/clients", &[("Cookie", &cookie)], "").await;
    assert!(page.contains("<h1>Clients</h1>"), "{page}");
    assert!(page.contains("Add a client"), "{page}");
    assert!(page.contains("No clients yet. Add one above."), "{page}");
    assert!(says_client(&visible_text(&page)).is_some(), "{page}");
    running.stop().await;
}

// K28: `clients_label` keeps working next to the vocabulary — the label
// names the page, the vocabulary words the sentences. Drilled red once by
// making the label lose to the vocabulary's plural.
#[tokio::test]
async fn k28_clients_label_still_names_the_page_when_set() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = app(dir.path(), Router::new());
    app.vocabulary("source", "sources");
    app.clients_label("Feeds");
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let (_, _, page) = http(addr, "GET", "/clients", &[("Cookie", &cookie)], "").await;
    assert!(page.contains("<h1>Feeds</h1>"), "{page}");
    assert!(page.contains("Add a source"), "{page}");
    assert_eq!(says_client(&visible_text(&page)), None, "{page}");
    running.stop().await;
}

// K28: the clients API refuses in the project's words — duplicate name,
// bad name, unknown id, revoked row — and every refusal keeps a remedy.
// Drilled red once by wording the duplicate refusal with "client" again.
#[tokio::test]
async fn k28_api_refusals_speak_the_vocabulary() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = app(dir.path(), Router::new());
    app.vocabulary("source", "sources");
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let admin = [("Cookie", cookie.as_str())];

    let (status, body) = issue(addr, &cookie, "job-tracker").await;
    assert_eq!(status, 201, "{body}");
    let id = id_of(&body);

    let (status, body) = issue(addr, &cookie, "job-tracker").await;
    assert_eq!(status, 400, "{body}");
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(
        v["error"],
        "a source named `job-tracker` already has a token"
    );
    assert_eq!(
        v["remedy"],
        "re-issue that source's token instead, or revoke it first to free the name"
    );

    let (status, body) = issue(addr, &cookie, "not allowed!").await;
    assert_eq!(status, 400, "{body}");
    assert!(
        body.contains("source name `not allowed!` is not allowed"),
        "{body}"
    );

    let (status, _, body) = http(addr, "POST", "/api/clients/no-such-id/reissue", &admin, "").await;
    assert_eq!(status, 404, "{body}");
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(v["error"], "no source with id no-such-id");
    assert!(v["remedy"].as_str().unwrap().contains("sources page"));

    let (status, _, _) = http(
        addr,
        "POST",
        &format!("/api/clients/{id}/revoke"),
        &admin,
        "",
    )
    .await;
    assert_eq!(status, 200);
    let (status, _, body) =
        http(addr, "GET", &format!("/api/clients/{id}/token"), &admin, "").await;
    assert_eq!(status, 400, "{body}");
    assert!(
        body.contains(&format!("source {id} is revoked")) && body.contains("issue a new source"),
        "{body}"
    );
    for word in ["client", "Client"] {
        assert!(!body.contains(word), "{body}");
    }
    running.stop().await;
}

type Seen = Arc<Mutex<Vec<String>>>;

/// The project's own route behind a row action: records the id, refuses
/// the marker id the way Almanac refuses a sync while Google is down.
async fn sync(State(seen): State<Seen>, Path(id): Path<String>) -> Result<StatusCode, Error> {
    if id == "refuse-me" {
        return Err(Error::dependency(
            "Google Calendar is not reachable",
            "check /healthz and try again in a minute",
        ));
    }
    seen.lock().unwrap().push(id);
    Ok(StatusCode::NO_CONTENT)
}

// K29: a registered row action is a [data-post] button on every active row
// with the id in the route, in registration order, absent on a revoked row;
// a destructive one carries both rule-31 attributes; the project's route
// answers the admin cookie, and a refusal is the kit's JSON with a remedy.
// Drilled red once by dropping the `{% for a in c.actions %}` block from
// clients.html.
#[tokio::test]
async fn k29_row_actions_render_on_active_rows_and_post_to_the_project_route() {
    let dir = tempfile::tempdir().unwrap();
    let seen: Seen = Default::default();
    let mut app = app(dir.path(), Router::new());
    app.client_action(ClientAction::post("Sync now", "/sources/{id}/sync").busy_label("Syncing…"));
    app.client_action(
        ClientAction::post("Purge events", "/sources/{id}/events")
            .method("DELETE")
            .destructive("Purge every event of this source?"),
    );
    app.dashboard_routes(
        Router::new()
            .route("/sources/{id}/sync", post(sync))
            .with_state(seen.clone()),
    );
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let admin = [("Cookie", cookie.as_str())];

    let (_, live) = issue(addr, &cookie, "live").await;
    let live = id_of(&live);
    let (_, gone) = issue(addr, &cookie, "gone").await;
    let gone = id_of(&gone);
    let (status, _, _) = http(
        addr,
        "POST",
        &format!("/api/clients/{gone}/revoke"),
        &admin,
        "",
    )
    .await;
    assert_eq!(status, 200);

    let (_, _, page) = http(addr, "GET", "/clients", &admin, "").await;
    let sync_button = format!(
        "data-post=\"/sources/{live}/sync\" data-method=\"POST\" data-busy-label=\"Syncing…\">Sync now</button>"
    );
    assert!(page.contains(&sync_button), "{page}");
    let purge_button = format!(
        "class=\"kp-button kp-button--destructive\" data-post=\"/sources/{live}/events\" data-method=\"DELETE\" data-kp-destructive data-kp-confirm=\"Purge every event of this source?\">Purge events</button>"
    );
    assert!(page.contains(&purge_button), "rule 31 attributes: {page}");
    assert!(
        page.find(&sync_button).unwrap() < page.find(&purge_button).unwrap(),
        "registration order"
    );
    assert!(
        !page.contains(&format!("/sources/{gone}/")),
        "no action on a revoked row: {page}"
    );
    assert!(
        !page.contains("{id}"),
        "every placeholder is filled: {page}"
    );

    // What the button's fetch does: POST the substituted route with the
    // session cookie, asking for JSON.
    let json = [("Cookie", cookie.as_str()), ("Accept", "application/json")];
    let (status, _, _) = http(addr, "POST", &format!("/sources/{live}/sync"), &json, "").await;
    assert_eq!(status, 204);
    assert_eq!(seen.lock().unwrap().as_slice(), std::slice::from_ref(&live));
    let (status, _, body) = http(addr, "POST", "/sources/refuse-me/sync", &json, "").await;
    assert_eq!(status, 502, "{body}");
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(v["error"], "Google Calendar is not reachable");
    assert_eq!(v["remedy"], "check /healthz and try again in a minute");
    assert_eq!(seen.lock().unwrap().len(), 1, "a refusal records nothing");
    // The route is behind the admin session like every dashboard route.
    let (status, _, _) = http(addr, "POST", &format!("/sources/{live}/sync"), &[], "").await;
    assert_eq!(status, 303);
    running.stop().await;
}

struct Profiles;

impl StatusSection for Profiles {
    fn render(&self) -> Section {
        Section {
            title: "Profiles".into(),
            explain: "The source profiles read from disk at start.".into(),
            rows: vec![("Loaded".into(), "3".into())],
            html: None,
        }
    }
    fn actions(&self) -> Vec<SectionAction> {
        vec![
            SectionAction::post("Reload profiles from disk", "/calendars/reload")
                .busy_label("Reloading…"),
            SectionAction::post("Forget all", "/calendars")
                .method("DELETE")
                .destructive("Forget every profile?"),
        ]
    }
}

struct Quiet;

impl StatusSection for Quiet {
    fn render(&self) -> Section {
        Section {
            title: "Quiet".into(),
            explain: "A section that offers nothing to press.".into(),
            rows: vec![("Rows".into(), "1".into())],
            html: None,
        }
    }
}

async fn reload(State(seen): State<Seen>) -> StatusCode {
    seen.lock().unwrap().push("reload".into());
    StatusCode::NO_CONTENT
}

// K29: a section with actions renders its buttons on `/` in one block under
// its rows; a section without actions renders no block at all. Drilled red
// once by dropping the `{% if section.actions %}` block from status.html.
#[tokio::test]
async fn k29_section_actions_render_under_the_section_and_none_without() {
    let dir = tempfile::tempdir().unwrap();
    let seen: Seen = Default::default();
    let mut app = app(dir.path(), Router::new());
    app.status_section(Profiles);
    app.status_section(Quiet);
    app.dashboard_routes(
        Router::new()
            .route("/calendars/reload", post(reload))
            .with_state(seen.clone()),
    );
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let (_, _, page) = http(addr, "GET", "/", &[("Cookie", &cookie)], "").await;
    assert_eq!(
        page.matches("class=\"actions section-actions\"").count(),
        1,
        "one block, for the one section that has actions: {page}"
    );
    assert!(
        page.contains(
            "data-post=\"/calendars/reload\" data-method=\"POST\" data-busy-label=\"Reloading…\">Reload profiles from disk</button>"
        ),
        "{page}"
    );
    assert!(
        page.contains(
            "data-post=\"/calendars\" data-method=\"DELETE\" data-kp-destructive data-kp-confirm=\"Forget every profile?\">Forget all</button>"
        ),
        "{page}"
    );
    // The block sits under its own section, before the next heading.
    let profiles = page.find("<h2>Profiles</h2>").unwrap();
    let quiet = page.find("<h2>Quiet</h2>").unwrap();
    let block = page.find("section-actions").unwrap();
    assert!(profiles < block && block < quiet, "{page}");
    let (status, _, _) = http(
        addr,
        "POST",
        "/calendars/reload",
        &[("Cookie", &cookie), ("Accept", "application/json")],
        "",
    )
    .await;
    assert_eq!(status, 204);
    assert_eq!(seen.lock().unwrap().as_slice(), ["reload".to_string()]);
    running.stop().await;
}
