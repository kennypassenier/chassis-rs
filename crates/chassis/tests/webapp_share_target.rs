//! A GET share target registered on the web app is guarded by the kit in the
//! real mount: a cross-site navigation with the admin's cookie is refused.
#![cfg(all(feature = "testing", feature = "webapp"))]

use axum::Router;
use axum::routing::get;
use chassis::AppSpec;
use chassis::shell::webapp::{Pwa, ShareTarget, WebApp};
use chassis::testing::TestApp;

const FILES: &[(&str, &[u8])] = &[("index.html", b"<!doctype html><html><head></head></html>")];

#[tokio::test]
async fn a_cross_site_get_share_is_refused_in_the_real_mount() {
    let spec = AppSpec {
        name: "habits",
        version: "0.0.0",
        ..Default::default()
    };
    let mut app = TestApp::start_with(spec, Router::new(), |app| {
        app.webapp(
            WebApp::embedded(FILES).pwa(Pwa::new().share_target(ShareTarget::get("/capture"))),
        );
        app.dashboard_routes(Router::new().route("/capture", get(|| async { "saved" })));
    })
    .await;
    app.login().await;
    let cookie = app.session_cookie().expect("logged in").to_string();
    let get = |site: Option<&'static str>| {
        let mut r = reqwest::Client::new()
            .get(app.url("/capture?text=x"))
            .header(reqwest::header::COOKIE, cookie.clone());
        if let Some(s) = site {
            r = r.header("sec-fetch-site", s);
        }
        r.send()
    };
    assert_eq!(get(Some("cross-site")).await.unwrap().status(), 403);
    assert_eq!(get(Some("none")).await.unwrap().status(), 200);
    assert_eq!(get(None).await.unwrap().status(), 200);
}
