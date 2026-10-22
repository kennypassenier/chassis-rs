//! Trusted sources (3.13.0; Kenny, 2026-10-22: "mijn pc heeft altijd
//! toegang, zonder token"): a request whose TCP peer is listed in
//! `<P>_TRUSTED_ADMINS` is the admin without a login; everyone else still
//! logs in, a bearer still decides, and a list that would let a proxy's
//! whole audience in refuses to start.
#![cfg(all(feature = "testing", feature = "dashboard"))]

use axum::Router;
use chassis::AppSpec;
use chassis::testing::TestApp;
use reqwest::Method;
use reqwest::header::ACCEPT;

fn spec(name: &'static str) -> AppSpec {
    AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_listed_peer_is_the_admin_without_a_login() {
    let mut app = TestApp::start_with_env(
        spec("trusta"),
        Router::new(),
        &[("TRUSTA_TRUSTED_ADMINS", "127.0.0.1")],
        |_| {},
    )
    .await;
    assert!(app.session_cookie().is_none(), "the test never logs in");
    let (s, html) = app.page("/").await;
    assert_eq!(s, 200, "the home page opens without a session: {html}");
    let (s, _) = app.get_json("/api/kit/clients").await;
    assert_eq!(s, 200, "the kit's admin API answers too");
    // The login page has nothing to ask this machine.
    let r = app
        .request(Method::GET, "/login")
        .header(ACCEPT, "text/html")
        .send()
        .await
        .unwrap();
    assert!(r.status().is_redirection(), "{}", r.status());
    assert_eq!(r.headers()["location"], "/");
    // A bearer still decides: a wrong one is refused, not upgraded.
    let r = app
        .bearer(Method::GET, "/api/kit/clients", "not-the-token-at-all")
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401);
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn an_unlisted_peer_still_logs_in() {
    let mut app = TestApp::start_with_env(
        spec("trustb"),
        Router::new(),
        &[("TRUSTB_TRUSTED_ADMINS", "10.10.10.10")],
        |_| {},
    )
    .await;
    let r = app
        .request(Method::GET, "/")
        .header(ACCEPT, "text/html")
        .send()
        .await
        .unwrap();
    assert!(r.status().is_redirection(), "{}", r.status());
    assert_eq!(r.headers()["location"], "/login");
    // What a header claims about the sender is never believed.
    let r = app
        .request(Method::GET, "/api/kit/clients")
        .header("x-forwarded-for", "10.10.10.10")
        .send()
        .await
        .unwrap();
    assert_eq!(r.headers()["location"], "/login", "{}", r.status());
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_list_that_opens_too_much_refuses_to_start() {
    for (name, env) in [
        ("trustc", vec![("TRUSTC_TRUSTED_ADMINS", "0.0.0.0")]),
        ("trustd", vec![("TRUSTD_TRUSTED_ADMINS", "10.10.10.0/24")]),
        (
            "truste",
            vec![
                ("TRUSTE_TRUSTED_PROXIES", "127.0.0.1"),
                ("TRUSTE_TRUSTED_ADMINS", "127.0.0.1"),
            ],
        ),
    ] {
        let refused = TestApp::try_start_with_env(spec(name), Router::new(), &env, |_| {}).await;
        assert!(refused.is_err(), "{name} started with {env:?}");
    }
}
