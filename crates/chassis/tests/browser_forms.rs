//! CF-7 (2026-09-06, found live on CT 112): a dashboard exists for a
//! browser, and a browser submitting a form is a *navigation*. Under the
//! kit's former `referrer-policy: no-referrer` that navigation carried
//! `Origin: null`, which the CSRF rule refused — login included — and the
//! refusal arrived as a bare JSON document on its own tab. These requests
//! send exactly the headers Chrome sends, so the browser is no longer the
//! one environment the suite never covered (rule 35). Driven through
//! `chassis::testing` (K25) since 1.8.0.
#![cfg(feature = "testing")]

use chassis::AppSpec;
use chassis::testing::TestApp;
use reqwest::Method;
use reqwest::header::{HeaderValue, ORIGIN};

#[tokio::test]
async fn a_browser_form_submit_is_accepted_and_a_cross_site_one_is_refused_as_a_page() {
    let mut app = TestApp::start(
        AppSpec {
            name: "formdemo",
            version: "0.0.0",
            ..Default::default()
        },
        axum::Router::new(),
    )
    .await;

    // What Chrome sent on CT 112: the same-origin fetch metadata with the
    // Origin blanked to `null` by the old referrer policy. The harness's
    // `as_browser()` carries today's Origin; the CF-7 case overrides it.
    let mut chrome_under_no_referrer = app.as_browser();
    chrome_under_no_referrer.insert(ORIGIN, HeaderValue::from_static("null"));

    // The login form, exactly as Chrome submits it, with a wrong token:
    // the login page answers (200 with the message), never the 403.
    let response = app
        .request(Method::POST, "/login")
        .headers(chrome_under_no_referrer.clone())
        .form(&[("token", "not-the-token")])
        .send()
        .await
        .unwrap();
    let status = response.status().as_u16();
    let referrer_policy = header(&response, "referrer-policy");
    let body = response.text().await.unwrap();
    assert_eq!(
        status, 200,
        "a same-origin form submit passes the CSRF rule: {body}"
    );
    assert!(body.contains("<form"), "the login page comes back: {body}");
    assert_eq!(
        referrer_policy.as_deref(),
        Some("same-origin"),
        "the policy no longer blanks the same-origin referrer: {referrer_policy:?}"
    );

    // The same submit with the right token logs in (a redirect home).
    let response = app
        .request(Method::POST, "/login")
        .headers(chrome_under_no_referrer)
        .form(&[("token", app.token())])
        .send()
        .await
        .unwrap();
    assert_eq!(
        response.status().as_u16(),
        303,
        "login succeeded from a browser form"
    );
    assert!(
        header(&response, "set-cookie").is_some(),
        "a session was issued"
    );

    // A cross-site form post (an attacker's page) is refused — and, being a
    // navigation, refused as a page in the dashboard layout, not as JSON.
    let response = app
        .request(Method::POST, "/login")
        .headers(app.as_cross_site_browser())
        .form(&[("token", "x")])
        .send()
        .await
        .unwrap();
    assert_eq!(response.status().as_u16(), 403);
    let content_type = header(&response, "content-type").unwrap_or_default();
    assert!(content_type.starts_with("text/html"), "{content_type}");
    let body = response.text().await.unwrap();
    assert!(
        body.contains("kp-nav"),
        "rendered inside the layout: {body}"
    );
    assert!(body.contains("cross-site request"), "{body}");
    assert!(body.contains("Back to the dashboard"), "{body}");

    // A script (no fetch metadata, no Accept for HTML) keeps the JSON shape.
    let response = app
        .request(Method::POST, "/login")
        .header(ORIGIN, "https://evil.example")
        .form(&[("token", "x")])
        .send()
        .await
        .unwrap();
    assert_eq!(response.status().as_u16(), 403);
    let content_type = header(&response, "content-type").unwrap_or_default();
    assert!(
        content_type.starts_with("application/json"),
        "{content_type}"
    );
    let body = response.text().await.unwrap();
    assert!(body.contains("\"remedy\""), "{body}");

    app.shutdown().await;
}

fn header(response: &reqwest::Response, name: &str) -> Option<String> {
    response
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_ascii_lowercase())
}
