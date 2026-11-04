//! A login lands where the visitor was going (`next`), and only there when
//! it is a plain same-origin path (reported by Kitchen, 2026-11-02).
#![cfg(all(feature = "testing", feature = "dashboard"))]

use axum::Router;
use chassis::AppSpec;
use chassis::testing::TestApp;
use reqwest::Method;
use reqwest::header::ACCEPT;

async fn start(name: &'static str) -> TestApp {
    let spec = AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    };
    // Several logins from one address in a row: lift the login limit.
    let burst = format!("{}_RATE_LIMIT_LOGIN_BURST", name.to_uppercase());
    TestApp::start_with_env(spec, Router::new(), &[(burst.as_str(), "100")], |_| {}).await
}

/// `POST /login` with the right token and this `next`; the 303's location.
async fn login_location(app: &TestApp, next: Option<&str>) -> String {
    let token = app.token().to_string();
    let mut form = vec![("token", token.as_str())];
    if let Some(n) = next {
        form.push(("next", n));
    }
    let r = app
        .request(Method::POST, "/login")
        .form(&form)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 303, "a right token redirects");
    r.headers()["location"].to_str().unwrap().to_string()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_logged_out_page_load_carries_its_path_to_the_login() {
    let mut app = start("nextround").await;
    let r = app
        .request(Method::GET, "/clients?sort=name&dir=desc")
        .header(ACCEPT, "text/html")
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 303);
    let to = r.headers()["location"].to_str().unwrap().to_string();
    assert_eq!(to, "/login?next=%2Fclients%3Fsort%3Dname%26dir%3Ddesc");
    // The login page keeps it in the form, and the form goes back to it.
    let (s, html) = app.page(&to).await;
    assert_eq!(s, 200);
    // The template escapes `/` and `&`; the browser reads them back.
    assert!(
        html.contains(r#"name="next" value="&#x2f;clients?sort=name&amp;dir=desc""#),
        "hidden field missing: {html}"
    );
    let back = login_location(&app, Some("/clients?sort=name&dir=desc")).await;
    assert_eq!(back, "/clients?sort=name&dir=desc");
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_home_page_needs_no_next_and_login_defaults_to_home() {
    let mut app = start("nextdefault").await;
    let r = app
        .request(Method::GET, "/")
        .header(ACCEPT, "text/html")
        .send()
        .await
        .unwrap();
    assert_eq!(r.headers()["location"], "/login");
    assert_eq!(login_location(&app, None).await, "/");
    assert_eq!(login_location(&app, Some("")).await, "/");
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn an_unsafe_next_is_refused_and_login_goes_home() {
    let mut app = start("nextevil").await;
    for evil in [
        "//evil.example",
        "/\\evil.example",
        "https://evil.example",
        "http://evil.example/x",
        "javascript:alert(1)",
        "evil.example",
        "/\t/evil.example",
        "/ok\r\nSet-Cookie: x=1",
        "/login",
        "/login?next=/",
        "/logout",
        "/%0d%0aX: y",
    ] {
        assert_eq!(login_location(&app, Some(evil)).await, "/", "{evil:?}");
    }
    // Encoded variants arrive decoded once by the form parser.
    let r = app
        .request(Method::POST, "/login")
        .header("content-type", "application/x-www-form-urlencoded")
        .body(format!("token={}&next=%2F%2Fevil.example", app.token()))
        .send()
        .await
        .unwrap();
    assert_eq!(r.headers()["location"], "/");
    // The login page never echoes an unsafe value into its form.
    let (_, html) = app.page("/login?next=%2F%2Fevil.example").await;
    assert!(!html.contains("evil.example"), "{html}");
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_wrong_token_keeps_next_in_the_form() {
    let mut app = start("nextwrong").await;
    let r = app
        .request(Method::POST, "/login")
        .form(&[("token", "not-the-token-at-all"), ("next", "/clients")])
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let html = r.text().await.unwrap();
    assert!(
        html.contains(r#"name="next" value="&#x2f;clients""#),
        "{html}"
    );
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_signed_in_browser_skips_the_form_and_lands_on_next() {
    // Kitchen 2026-11-04: signed in again in another tab, the login page
    // answered 303 to `/` instead of the page the visitor came from.
    let mut app = start("nextsigned").await;
    app.login().await;
    let location = |path: &'static str| {
        let r = app.request(Method::GET, path).header(ACCEPT, "text/html");
        async move { r.send().await.unwrap() }
    };
    let r = location("/login?next=%2Fclients%3Fsort%3Dname").await;
    assert_eq!(r.status(), 303);
    assert_eq!(r.headers()["location"], "/clients?sort=name");
    let r = location("/login?next=https%3A%2F%2Fevil").await;
    assert_eq!(r.headers()["location"], "/", "an unsafe next goes home");
    app.shutdown().await;
}
