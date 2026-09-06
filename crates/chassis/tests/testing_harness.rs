//! K25: the `chassis::testing` harness proves itself — every helper has a
//! test that goes red when the behaviour it wraps is gone. Each test was
//! driven red once before it went green (standing rule 7e); the comment
//! on each says how.
#![cfg(feature = "testing")]

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::routing::{get, post};
use axum::{Json, Router as AxumRouter};
use chassis::shell::dashboard::ClientFormField;
use chassis::testing::TestApp;
use chassis::{AppSpec, Caller, Error};
use reqwest::Method;
use serde_json::json;

/// What the issue hook recorded: the client's name and its `calendar` field.
type SeenIssue = Arc<Mutex<Option<(String, Option<String>)>>>;

fn spec(name: &'static str) -> AppSpec {
    AppSpec {
        name,
        version: "1.2.3",
        ..Default::default()
    }
}

/// An API route that says who called it, so a test can tell a client
/// token from the admin's.
fn whoami() -> Router {
    Router::new().route(
        "/v1/whoami",
        get(|caller: Caller| async move {
            match caller {
                Caller::Admin => "admin".to_string(),
                Caller::Client { name, .. } => name,
            }
        }),
    )
}

// Drilled red by asserting `port == 0`.
#[tokio::test]
async fn k25_start_binds_port_0_serves_from_a_temp_dir_and_shutdown_closes_the_port() {
    let mut app = TestApp::start(spec("k25demo"), Router::new()).await;
    assert_ne!(app.addr().port(), 0, "the kernel picked a real port");
    assert_eq!(app.base_url(), format!("http://{}", app.addr()));
    assert!(
        app.state_dir().is_dir(),
        "the state dir exists while running"
    );
    assert!(
        app.token().len() >= 16,
        "the generated login token satisfies the kit's minimum"
    );
    let (status, health) = app.get_json("/healthz").await;
    assert_eq!(status, 200, "{health}");
    assert_eq!(
        health["version"], "1.2.3",
        "the app reports its own version"
    );

    app.shutdown().await;
    let refused = reqwest::Client::new().get(app.url("/healthz")).send().await;
    assert!(
        refused.is_err(),
        "after shutdown nothing listens on {}",
        app.addr()
    );
    app.shutdown().await; // a second call is a no-op
}

// Drilled red by dropping the `login()` call: the page then answers 303.
#[tokio::test]
async fn k25_login_keeps_the_session_so_pages_and_json_answer_as_the_admin() {
    let mut app = TestApp::start(spec("k25login"), Router::new()).await;
    assert!(app.session_cookie().is_none());
    let (status, _) = app.page("/").await;
    assert_eq!(status, 303, "the status page needs the admin login");
    let (status, _) = app.get_json("/api/clients").await;
    assert_eq!(status, 303, "the clients API needs the admin login too");

    app.login().await;
    assert!(
        app.session_cookie()
            .is_some_and(|c| c.starts_with("k25login_session=")),
        "the cookie is the kit's session cookie: {:?}",
        app.session_cookie()
    );
    let (status, html) = app.page("/").await;
    assert_eq!(status, 200, "{html}");
    assert!(
        html.contains("k25login"),
        "the status page names the service"
    );
    let (status, list) = app.get_json("/api/clients").await;
    assert_eq!(status, 200);
    assert_eq!(list, json!([]));
    app.shutdown().await;
}

// Drilled red by skipping the revoke: the second whoami then answers 200.
#[tokio::test]
async fn k25_issue_client_returns_a_token_the_api_accepts_until_it_is_revoked() {
    let mut app = TestApp::start_with(spec("k25tokens"), Router::new(), |app| {
        app.api_routes(whoami());
    })
    .await;
    app.login().await;
    let client = app.issue_client("pager", &[]).await;
    assert_eq!(client.name, "pager");
    assert!(!client.id.is_empty() && !client.token.is_empty());

    let (status, who) =
        TestApp::send_text(app.bearer(Method::GET, "/v1/whoami", &client.token)).await;
    assert_eq!(status, 200, "{who}");
    assert_eq!(who, "pager", "the route sees the client by name");
    let (status, who) =
        TestApp::send_text(app.bearer(Method::GET, "/v1/whoami", app.token())).await;
    assert_eq!(status, 200, "{who}");
    assert_eq!(
        who, "admin",
        "the login token doubles as the admin's bearer"
    );
    let (status, _) =
        TestApp::send_text(app.bearer(Method::GET, "/v1/whoami", "not-a-token")).await;
    assert_eq!(status, 401, "a made-up token is refused");

    let (status, view) = app
        .post_json(&format!("/api/clients/{}/revoke", client.id), json!({}))
        .await;
    assert_eq!(status, 200, "{view}");
    assert_eq!(view["active"], false);
    let (status, _) =
        TestApp::send_text(app.bearer(Method::GET, "/v1/whoami", &client.token)).await;
    assert_eq!(status, 401, "a revoked token is refused");
    app.shutdown().await;
}

// Drilled red by swapping `as_browser()` for `as_cross_site_browser()` on
// the first post: the login page then never comes back (403).
#[tokio::test]
async fn k25_as_browser_passes_the_csrf_rule_and_the_cross_site_variant_is_refused() {
    let mut app = TestApp::start(spec("k25browser"), Router::new()).await;
    let same_origin = app.as_browser();
    assert_eq!(same_origin["sec-fetch-site"], "same-origin");
    assert_eq!(same_origin["origin"], app.base_url().as_str());
    assert_eq!(
        same_origin["referer"],
        format!("{}/", app.base_url()).as_str()
    );
    for name in ["sec-fetch-mode", "sec-fetch-dest", "accept", "content-type"] {
        assert!(same_origin.contains_key(name), "{name} is part of the set");
    }

    // A wrong token through the browser's form: the page answers, not the
    // CSRF refusal.
    let (status, html) = TestApp::send_text(
        app.request(Method::POST, "/login")
            .headers(same_origin)
            .form(&[("token", "wrong")]),
    )
    .await;
    assert_eq!(status, 200, "{html}");
    assert!(
        html.contains("not right"),
        "the login page reports the wrong token: {html}"
    );

    let cross = app.as_cross_site_browser();
    assert_eq!(cross["sec-fetch-site"], "cross-site");
    assert_ne!(cross["origin"], app.base_url().as_str());
    let (status, html) = TestApp::send_text(
        app.request(Method::POST, "/login")
            .headers(cross)
            .form(&[("token", app.token())]),
    )
    .await;
    assert_eq!(status, 403, "{html}");
    assert!(
        html.contains("cross-site request"),
        "refused by the CSRF rule, as a page: {html}"
    );
    app.shutdown().await;
}

// Drilled red by removing the `("calendar", "cal-9")` field: the hook then
// records `None` for it.
#[tokio::test]
async fn k25_start_with_env_reaches_the_app_and_issue_fields_reach_the_project_hook() {
    let seen: SeenIssue = Default::default();
    let shutdown_timeout = Arc::new(Mutex::new(None));
    let record = seen.clone();
    let timeout_seen = shutdown_timeout.clone();
    let mut app = TestApp::start_with_env(
        spec("k25env"),
        Router::new(),
        &[("K25ENV_SHUTDOWN_TIMEOUT_MS", "4321")],
        move |app| {
            *timeout_seen.lock().unwrap() = Some(app.shutdown_timeout);
            app.client_form_field(chassis::shell::dashboard::ClientFormField::text(
                "calendar", "Calendar", "cal-…",
            ));
            app.on_client_issued(move |client, fields| {
                *record.lock().unwrap() =
                    Some((client.name.clone(), fields.get("calendar").cloned()));
                Ok(())
            });
        },
    )
    .await;
    assert_eq!(
        *shutdown_timeout.lock().unwrap(),
        Some(std::time::Duration::from_millis(4321)),
        "an extra environment entry reaches the app's knobs"
    );
    app.login().await;
    let client = app
        .issue_client("job-tracker", &[("calendar", "cal-9")])
        .await;
    assert_eq!(client.name, "job-tracker");
    assert_eq!(
        *seen.lock().unwrap(),
        Some(("job-tracker".to_string(), Some("cal-9".to_string()))),
        "the hook saw the client-to-be and the field"
    );
    app.shutdown().await;
}

// Drilled red by expecting 200 from the delete: the kit answers 204.
#[tokio::test]
async fn k25_json_helpers_issue_list_and_delete_as_the_admin() {
    let mut app = TestApp::start(spec("k25json"), Router::new()).await;
    app.login().await;
    let (status, created) = app.post_json("/api/clients", json!({"name": "one"})).await;
    assert_eq!(status, 201, "{created}");
    let id = created["id"].as_str().unwrap().to_string();
    let (status, list) = app.get_json("/api/clients").await;
    assert_eq!(status, 200);
    assert_eq!(list.as_array().map(Vec::len), Some(1), "{list}");
    assert_eq!(list[0]["name"], "one");
    let (status, body) = app.delete(&format!("/api/clients/{id}")).await;
    assert_eq!(status, 204);
    assert_eq!(body, serde_json::Value::Null, "an empty body reads as Null");
    let (status, missing) = app.delete(&format!("/api/clients/{id}")).await;
    assert_eq!(status, 404, "{missing}");
    assert!(
        missing["remedy"].is_string(),
        "the kit's JSON error keeps its remedy: {missing}"
    );
    let (_, list) = app.get_json("/api/clients").await;
    assert_eq!(list, json!([]));
    app.shutdown().await;
}

// Drilled red by giving the "closed" spec `open_dashboard: true`: it then
// starts, and the test's panic on `Ok` fires.
#[tokio::test]
async fn k25_start_open_needs_no_secrets_and_a_closed_service_is_refused() {
    let mut app = TestApp::start_open(
        AppSpec {
            open_dashboard: true,
            ..spec("k25open")
        },
        Router::new(),
        |app| {
            app.api_routes(Router::new().route("/v1/ping", post(|| async { "pong" })));
        },
    )
    .await;
    let (status, html) = app.page("/").await;
    assert_eq!(status, 200, "no login on an open dashboard: {html}");
    assert!(html.contains("This dashboard is open"));
    let (status, body) = TestApp::send_text(app.request(Method::POST, "/v1/ping")).await;
    assert_eq!((status, body.as_str()), (200, "pong"));
    let panicked =
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| app.token().to_string()));
    assert!(
        panicked.is_err(),
        "an open app has no token and says so instead of handing out an empty string"
    );
    app.shutdown().await;

    let refused = TestApp::try_start_open(spec("k25closed"), Router::new()).await;
    let error = match refused {
        Ok(mut started) => {
            started.shutdown().await;
            panic!("a service that did not opt in must not start without secrets");
        }
        Err(e) => e.to_string(),
    };
    assert!(
        error.contains("K25CLOSED_TOKEN") && error.contains("open_dashboard"),
        "{error}"
    );
}

// Drilled red by verifying the manifest against a second server's key:
// the signature does not verify.
#[cfg(feature = "self-update")]
#[tokio::test]
async fn k25_fake_release_server_serves_a_manifest_signed_for_the_repo_and_counts_version_reads() {
    use chassis::testing::FakeReleaseServer;
    let release =
        FakeReleaseServer::start("kennypassenier/svc", "1.2.3", b"#!/bin/sh\nexit 0\n", "svc")
            .await;
    let get = |name: &str| {
        let url = format!("{}/{name}", release.url);
        async move { reqwest::get(url).await.unwrap().text().await.unwrap() }
    };
    assert_eq!(get("VERSION").await, "1.2.3");
    assert_eq!(get("VERSION").await, "1.2.3");
    assert_eq!(
        release
            .version_hits
            .load(std::sync::atomic::Ordering::SeqCst),
        2,
        "every GET /VERSION is counted"
    );
    let manifest = get("SHA256SUMS").await;
    assert!(manifest.ends_with("  svc\n"), "{manifest}");
    let signature = get("SHA256SUMS.minisig").await;
    let verified =
        chassis::shell::update::verify_signature(&release.pubkey, manifest.as_bytes(), &signature)
            .expect("the served signature verifies with the served key");
    assert_eq!(verified.trusted_comment(), "kennypassenier/svc v1.2.3");
    assert_eq!(get("svc").await, "#!/bin/sh\nexit 0\n");
    assert!(release.dir.path().join("SHA256SUMS.minisig").is_file());

    let other = FakeReleaseServer::start("kennypassenier/svc", "1.2.3", b"x", "svc").await;
    assert!(
        chassis::shell::update::verify_signature(&other.pubkey, manifest.as_bytes(), &signature)
            .is_err(),
        "each server signs with its own throwaway key"
    );
}

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
