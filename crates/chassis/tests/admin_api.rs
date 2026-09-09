//! K38: `chassis::admin::AdminApi` against a real service.
//!
//! The service here is started by the kit's own harness, but the API drives
//! it exactly as it would drive a hub on another machine: over HTTP, with
//! that service's admin token as a bearer, through no in-process shortcut.

#![cfg(feature = "testing")]

use axum::Router;
use chassis::admin::AdminApi;
use chassis::testing::TestApp;
use chassis::{AppSpec, Kind};

fn spec(name: &'static str) -> AppSpec {
    AppSpec {
        name,
        default_state_dir: None,
        ..Default::default()
    }
}

/// The whole round trip a consumer needs: issue, use, reveal again, revoke.
/// Drilled red by pointing `issue_client` at `/api/client` (singular): the
/// service answered 404 and the test failed on the refusal.
#[tokio::test]
async fn k38_issue_reveal_and_revoke_a_client_at_another_service() {
    let app = TestApp::start(spec("k38hub"), Router::new()).await;
    let hub = AdminApi::new(&app.base_url(), app.token()).expect("an admin API for the hub");

    let client = hub
        .issue_client("kyu-runner", &[])
        .await
        .expect("the hub issued a client");
    assert_eq!(client.name, "kyu-runner");
    assert!(!client.token.is_empty(), "the token comes back with it");

    let listed = hub
        .list_clients()
        .await
        .expect("the hub listed its clients");
    assert!(
        listed.iter().any(|c| c.id == client.id && c.active),
        "the new client is in the list and active: {listed:?}"
    );
    assert_eq!(
        hub.client_id("kyu-runner").await.unwrap(),
        client.id,
        "a client can be found back by name"
    );
    assert_eq!(
        hub.reveal_token(&client.id).await.unwrap(),
        client.token,
        "the token can be read again"
    );

    hub.revoke_client(&client.id).await.expect("revoked");
    let after = hub.list_clients().await.unwrap();
    assert!(
        after.iter().any(|c| c.id == client.id && !c.active),
        "the row stays, the token stops: {after:?}"
    );

    let mut app = app;
    app.shutdown().await;
}

/// A wrong admin token is a refusal with a remedy, not a login page: the
/// client follows no redirects, so the 401 stays a 401 (K30's rule, from
/// the other side). Drilled red by handing it `app.token()`.
#[tokio::test]
async fn k38_a_wrong_admin_token_is_refused_with_a_remedy() {
    let app = TestApp::start(spec("k38auth"), Router::new()).await;
    let hub = AdminApi::new(&app.base_url(), "not-the-admin-token").unwrap();

    let error = hub.list_clients().await.expect_err("refused");
    assert_eq!(error.kind, Kind::Unauthorized, "{error}");
    assert!(!error.remedy.is_empty(), "every error carries a remedy");

    let mut app = app;
    app.shutdown().await;
}

/// A service that is not there fails as a dependency problem naming the
/// URL, not as a panic or a timeout with no cause. Drilled red by mapping
/// every transport failure to `Kind::Internal`.
#[tokio::test]
async fn k38_an_unreachable_service_says_which_url_did_not_answer() {
    // Port 1 on loopback: nothing listens, and the connection is refused
    // immediately rather than hanging.
    let hub = AdminApi::new("http://127.0.0.1:1", "any-token").unwrap();
    let error = hub.list_clients().await.expect_err("no service there");
    assert_eq!(error.kind, Kind::Dependency, "{error}");
    assert!(error.message.contains("127.0.0.1:1"), "{error}");
}

/// The two mistakes a caller makes at construction time are refused before
/// any request leaves the machine.
#[tokio::test]
async fn k38_a_url_without_a_scheme_and_an_empty_token_are_refused_up_front() {
    let no_scheme = AdminApi::new("kyu.example.lan", "token").expect_err("not a URL");
    assert_eq!(no_scheme.kind, Kind::Config, "{no_scheme}");
    let empty = AdminApi::new("https://kyu.example.lan", "   ").expect_err("no token");
    assert_eq!(empty.kind, Kind::Config, "{empty}");
}
