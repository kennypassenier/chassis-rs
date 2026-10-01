//! feat-webapp-1 and feat-live-1 end to end: a project's static browser app
//! and its live channel behind the kit's real login, through
//! `chassis::testing`.
#![cfg(all(feature = "testing", feature = "webapp", feature = "live"))]

use axum::Router;
use chassis::AppSpec;
use chassis::shell::live::Live;
use chassis::shell::webapp::WebApp;
use chassis::testing::TestApp;

const FILES: &[(&str, &[u8])] = &[
    (
        "index.html",
        b"<!doctype html><script type=\"module\" src=\"js/main.js\"></script>",
    ),
    ("js/main.js", b"new EventSource('/events');"),
];

fn spec() -> AppSpec {
    AppSpec {
        name: "webdemo",
        version: "0.0.0",
        ..Default::default()
    }
}

#[tokio::test]
async fn the_app_and_its_live_channel_sit_behind_the_login() {
    let live = Live::new(16).recheck_every(std::time::Duration::from_millis(100));
    let events = live.clone();
    let mut app = TestApp::start_with(spec(), Router::new(), move |app| {
        app.webapp(WebApp::embedded(FILES));
        app.dashboard_routes(events.router("/events"));
    })
    .await;

    // Without a session a browser is sent to the login, for the app and
    // for the channel alike.
    let (status, _) = app.page("/").await;
    assert_eq!(status, 303, "no session: redirect to /login");
    let (status, _) = app.page("/events").await;
    assert_eq!(status, 303);

    app.login().await;
    // feat-pages-1: the app sits at the root, so `/` is its home.
    let (status, body) = app.page("/").await;
    assert_eq!(status, 200, "{body}");
    assert!(body.contains("js/main.js"), "{body}");
    let (status, body) = app.page("/stacks/media").await;
    assert_eq!(status, 200, "a client-side route gets the index");
    assert!(body.contains("js/main.js"));
    let (status, _) = app.page("/app/stacks/media").await;
    assert_eq!(
        status, 308,
        "a bookmark from before 3.1.0 moves to the root"
    );

    // With `webapp` the whole kp-themes module set is served for the app,
    // not only the modules the kit's own pages use.
    for module in ["wizard.js", "datatable.js", "palette.js", "auto.js"] {
        let (status, body) = app.page(&format!("/static/kp/js/{module}")).await;
        assert_eq!(status, 200, "{module}: {body}");
    }

    // The kit's own pages keep their paths beside the app.
    let (status, body) = app.page("/status").await;
    assert_eq!(status, 200);
    assert!(body.contains("webdemo"), "{body}");
    let (status, body) = app.page("/api/kit/pages").await;
    assert_eq!(status, 200, "{body}");
    assert!(body.contains(r#""id":"status""#), "{body}");

    // The live channel streams to the logged-in browser.
    let cookie = app.session_cookie().expect("logged in").to_string();
    let mut res = reqwest::Client::new()
        .get(app.url("/events"))
        .header(reqwest::header::COOKIE, cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    assert_eq!(res.headers()["content-type"], "text/event-stream");
    for _ in 0..100 {
        if live.subscribers() == 1 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    live.publish("stack", &serde_json::json!({"name": "media"}))
        .unwrap();
    let chunk = tokio::time::timeout(std::time::Duration::from_secs(5), res.chunk())
        .await
        .expect("an event within 5 s")
        .unwrap()
        .expect("a chunk");
    let text = String::from_utf8_lossy(&chunk);
    assert!(text.contains("event: stack"), "{text}");
    assert!(text.contains(r#"data: {"name":"media"}"#), "{text}");

    // Logging out ends the open stream: the recheck finds no session.
    let logout = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap()
        .post(app.url("/logout"))
        .header(reqwest::header::COOKIE, app.session_cookie().unwrap())
        .send()
        .await
        .unwrap();
    assert!(logout.status().is_redirection(), "{}", logout.status());
    let ended = tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            match res.chunk().await {
                Ok(Some(c)) if String::from_utf8_lossy(&c).starts_with(':') => continue,
                Ok(Some(_)) => continue,
                Ok(None) | Err(_) => break,
            }
        }
    })
    .await;
    assert!(ended.is_ok(), "the stream ended after logout");
}
