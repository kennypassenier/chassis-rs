//! Start and shutdown, the login session, client tokens and the CSRF rule.

use axum::Router;

use chassis::testing::TestApp;
use reqwest::Method;
use serde_json::json;

use crate::fixtures::{spec, whoami};

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
        html.contains("Cross-site request"),
        "refused by the CSRF rule, as a page: {html}"
    );
    app.shutdown().await;
}
