//! Row actions and section actions posting to the project's routes.

use axum::Router;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::post;
use chassis::Error;
use chassis::shell::dashboard::{ClientAction, Section, SectionAction, StatusSection};

use crate::fixtures::{Quiet, Seen, app, http, id_of, issue, login};

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
        page.matches("class=\"kp-row section-actions\"").count(),
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
    let profiles = page.find(">Profiles</h2>").unwrap();
    let quiet = page.find(">Quiet</h2>").unwrap();
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
