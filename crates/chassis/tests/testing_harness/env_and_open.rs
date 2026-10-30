//! Environment overrides, json helpers, open services and the fake release server.

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::routing::post;
use chassis::AppSpec;
use chassis::testing::TestApp;
use reqwest::Method;
use serde_json::json;

use crate::fixtures::{SeenIssue, spec};

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

// Live-found by kyu on 1.8.0 (standing rule 8): a project that starts the
// app with a KNOWN `<PREFIX>_TOKEN` through `extra_env` — its 2.x
// app-token import scenario pre-writes a legacy file with that key — got a
// harness whose `token()` and `login()` still used the token the harness
// had generated and the app no longer knew. Red before the fix: `token()`
// returned the random value (kyu saw `login()` panic with "login as the
// admin failed").
#[tokio::test]
async fn k25_extra_env_overrides_the_harness_token_and_login_uses_it() {
    let known = "known-token-chosen-by-the-project-0001";
    let mut app = TestApp::start_with_env(
        spec("k25tok"),
        Router::new(),
        &[("K25TOK_TOKEN", known)],
        |_| {},
    )
    .await;
    assert_eq!(
        app.token(),
        known,
        "token() reports the token the app actually runs with, not the one the harness generated"
    );
    app.login().await;
    assert!(
        app.session_cookie().is_some(),
        "login() logged in with the overridden token"
    );
    app.shutdown().await;
}

// Same fault, second instance (measured while correcting the token one):
// `state_dir()` reported the harness's temporary directory even when
// `extra_env` pointed the app at another `<PREFIX>_STATE_DIR`.
#[tokio::test]
async fn k25_extra_env_overrides_the_harness_state_dir_and_state_dir_reports_it() {
    let own = tempfile::tempdir().expect("a temporary directory for the test");
    let mut app = TestApp::start_with_env(
        spec("k25dir"),
        Router::new(),
        &[("K25DIR_STATE_DIR", &own.path().display().to_string())],
        |_| {},
    )
    .await;
    assert_eq!(
        app.state_dir(),
        own.path(),
        "state_dir() reports the directory the app actually runs with"
    );
    app.shutdown().await;
}
