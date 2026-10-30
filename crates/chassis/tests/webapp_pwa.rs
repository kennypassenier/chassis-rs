//! feat-webapp-4 end to end: an installable web app behind the kit's real
//! login. The browser fetches the manifest, the worker and the icons
//! without a session, so exactly those are public; the login page links the
//! manifest so an installed app can sign in; nothing else opens up.
#![cfg(all(feature = "testing", feature = "webapp"))]

use axum::Router;
use chassis::AppSpec;
use chassis::shell::webapp::WebApp;
use chassis::testing::TestApp;

const FILES: &[(&str, &[u8])] = &[
    (
        "index.html",
        b"<!doctype html><html><head><title>t</title></head><body></body></html>",
    ),
    ("secret.txt", b"private"),
];

fn spec() -> AppSpec {
    AppSpec {
        name: "meds",
        version: "0.0.0",
        ..Default::default()
    }
}

async fn start(webapp: WebApp) -> TestApp {
    TestApp::start_with(spec(), Router::new(), move |app| {
        app.webapp(webapp.clone());
    })
    .await
}

/// A request with no cookie and no token, as the browser's own fetches are.
async fn anonymous(app: &TestApp, path: &str) -> reqwest::Response {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap()
        .get(app.url(path))
        .send()
        .await
        .unwrap()
}

#[tokio::test]
async fn the_install_files_are_public_and_nothing_else_is() {
    let app = start(WebApp::embedded(FILES)).await;
    let manifest = anonymous(&app, "/manifest.webmanifest").await;
    assert_eq!(manifest.status(), 200);
    assert_eq!(
        manifest.headers()["content-type"],
        "application/manifest+json"
    );
    let json: serde_json::Value = manifest.json().await.unwrap();
    assert_eq!(json["name"], "meds", "the brand title is the default name");
    assert_eq!(anonymous(&app, "/sw.js").await.status(), 200);
    for icon in ["icon-180", "icon-192", "icon-512", "icon-maskable-512"] {
        let res = anonymous(&app, &format!("/pwa/{icon}.png")).await;
        assert_eq!(res.status(), 200, "{icon}");
        assert_eq!(res.headers()["content-type"], "image/png");
    }
    assert_eq!(anonymous(&app, "/pwa/offline").await.status(), 200);
    // The app itself and its files still ask for the login.
    assert_eq!(anonymous(&app, "/").await.status(), 303);
    assert_eq!(anonymous(&app, "/secret.txt").await.status(), 303);
}

#[tokio::test]
async fn the_login_page_links_the_manifest_and_the_app_page_does_too() {
    let mut app = start(WebApp::embedded(FILES)).await;
    let (status, login) = app.page("/login").await;
    assert_eq!(status, 200);
    assert_eq!(login.matches("rel=\"manifest\"").count(), 1, "{login}");
    assert!(login.contains("name=\"theme-color\""));
    app.login().await;
    let (_, page) = app.page("/").await;
    assert_eq!(page.matches("rel=\"manifest\"").count(), 1, "{page}");
    assert!(page.contains("webapp-runtime.js"));
}

#[tokio::test]
async fn an_app_that_opts_out_exposes_and_links_nothing() {
    let mut app = start(WebApp::embedded(FILES).without_pwa()).await;
    assert_eq!(anonymous(&app, "/manifest.webmanifest").await.status(), 303);
    assert_eq!(anonymous(&app, "/sw.js").await.status(), 303);
    let (_, login) = app.page("/login").await;
    assert!(!login.contains("manifest"), "{login}");
    app.login().await;
    let (_, page) = app.page("/").await;
    assert!(!page.contains("manifest"));
}
