//! The worked example from docs/testing.md and declared client fields.

use std::sync::{Arc, Mutex};

use axum::routing::{get, post};
use axum::{Json, Router, Router as AxumRouter};
use chassis::shell::dashboard::ClientFormField;
use chassis::testing::TestApp;
use chassis::{AppSpec, Caller, Error};
use reqwest::Method;
use serde_json::json;

use crate::fixtures::spec;

/// The profiles `on_client_issued` created: client name → calendar id.
type Profiles = Arc<Mutex<Vec<(String, String)>>>;

// The worked example in docs/TESTING.md, verbatim, so the document is
// compiled and run rather than trusted. Drilled red by dropping the
// `("calendar", "cal-42")` field: the hook then refuses and issue_client
// panics with the hook's remedy.
#[tokio::test]
async fn k25_worked_example_from_docs_testing_md_runs_as_written() {
    let profiles: Profiles = Default::default();
    let made = profiles.clone();
    let listed = profiles.clone();
    let mut app = TestApp::start_with(
        AppSpec {
            name: "calhub",
            version: env!("CARGO_PKG_VERSION"),
            ..Default::default()
        },
        AxumRouter::new(),
        |app| {
            // What `main` registers, verbatim.
            app.client_form_field(ClientFormField::text("calendar", "Calendar", "primary"));
            app.on_client_issued(move |client, fields| {
                let calendar = fields.get("calendar").ok_or_else(|| {
                    Error::invalid("a source needs a calendar", "fill in the Calendar field")
                })?;
                made.lock()
                    .unwrap()
                    .push((client.name.clone(), calendar.clone()));
                Ok(())
            });
            app.api_routes(AxumRouter::new().route(
                "/v1/events",
                post(
                    |caller: Caller, Json(event): Json<serde_json::Value>| async move {
                        let source = match caller {
                            Caller::Client { name, .. } => name,
                            Caller::Admin => "admin".to_string(),
                        };
                        Json(json!({ "source": source, "stored": event }))
                    },
                ),
            ));
            app.nav_entry("Sources", "/sources");
            app.dashboard_routes(AxumRouter::new().route(
                "/sources",
                get(move || {
                    let rows = listed.lock().unwrap().clone();
                    async move {
                        axum::response::Html(format!(
                            "<ul>{}</ul>",
                            rows.iter()
                                .map(|(name, cal)| format!("<li>{name} → {cal}</li>"))
                                .collect::<String>()
                        ))
                    }
                }),
            ));
        },
    )
    .await;

    // 1. Log in as the admin and issue a source through the Clients page's API.
    app.login().await;
    let source = app
        .issue_client("job-tracker", &[("calendar", "cal-42")])
        .await;
    assert_eq!(
        profiles.lock().unwrap().as_slice(),
        [("job-tracker".to_string(), "cal-42".to_string())],
        "the hook made the profile before the token existed"
    );

    // 2. The source posts an event with its token, as a script would.
    let (status, stored) = TestApp::send_json(
        app.bearer(Method::POST, "/v1/events", &source.token)
            .json(&json!({ "title": "Interview" })),
    )
    .await;
    assert_eq!(status, 200, "{stored}");
    assert_eq!(stored["source"], "job-tracker");

    // 3. The project's own page renders behind the login.
    let (status, html) = app.page("/sources").await;
    assert_eq!(status, 200);
    assert!(html.contains("job-tracker → cal-42"), "{html}");

    // 4. A missing field is refused by the hook, with its remedy, and nothing is issued.
    let (status, refused) = app
        .post_json("/api/clients", json!({ "name": "no-calendar" }))
        .await;
    assert_eq!(status, 400, "{refused}");
    assert_eq!(refused["remedy"], "fill in the Calendar field");

    app.shutdown().await;
}

// feat-clients-2: the kit keeps what the project declared. This is the whole
// promise from a consumer's side — declare a field, and the value is stored,
// shown, returned by the API and gone with the client — so it is driven over
// real HTTP against a real app rather than against the store.
#[tokio::test]
async fn feat_clients_2_a_declared_field_is_stored_shown_and_returned() {
    let mut app = TestApp::start_with(spec("fields"), Router::new(), |app| {
        app.client_form_field(ClientFormField::text("calendar", "Calendar", "cal-…"));
    })
    .await;
    app.login().await;

    let client = app
        .issue_client("almanac", &[("calendar", "work-cal")])
        .await;

    // Returned by the API, so `chassis clients list --json` carries it too.
    let (status, listed) = app.get_json("/api/clients").await;
    assert_eq!(status, 200);
    let row = listed
        .as_array()
        .and_then(|rows| rows.iter().find(|r| r["id"] == client.id))
        .expect("the new client is listed");
    assert_eq!(
        row["fields"]["calendar"], "work-cal",
        "the declared field comes back from the API: {row}"
    );

    // Shown on the page, under the label the project gave the field.
    let (page_status, page) = app.page("/clients").await;
    assert_eq!(page_status, 200);
    assert!(page.contains(">Calendar</th>"), "{page}");
    assert!(page.contains("work-cal"), "{page}");

    // A key the project never declared is not stored, so a caller cannot
    // grow the store by posting extra JSON.
    let (sneaky_status, sneaky) = app
        .post_json(
            "/api/clients",
            serde_json::json!({"name": "sneaky", "calendar": "c", "surprise": "x"}),
        )
        .await;
    assert_eq!(sneaky_status, 201, "{sneaky}");
    assert_eq!(
        sneaky["fields"]["surprise"],
        serde_json::Value::Null,
        "an undeclared key is not kept: {sneaky}"
    );
    assert_eq!(sneaky["fields"]["calendar"], "c");

    app.shutdown().await;
}
