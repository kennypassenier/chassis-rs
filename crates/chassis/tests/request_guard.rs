//! feat-guard-1 end to end: a project's guard answers before every route,
//! the kit's own login and assets included, and `/healthz` stays open.
#![cfg(all(feature = "testing", feature = "request-guard"))]

use axum::Router;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use chassis::AppSpec;
use chassis::testing::TestApp;

#[tokio::test]
async fn the_guard_stands_in_front_of_the_kits_own_routes() {
    let app = TestApp::start_with(
        AppSpec {
            name: "guarddemo",
            version: "0.0.0",
            ..Default::default()
        },
        Router::new(),
        |app| {
            app.request_guard(|r| async move {
                if r.headers.get("x-house").is_some_and(|v| v == "yes") {
                    Ok(())
                } else {
                    Err((StatusCode::FORBIDDEN, "only from the house").into_response())
                }
            });
        },
    )
    .await;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    for path in [
        "/login",
        "/",
        "/static/kp/dist/kp-themes.css",
        "/api/clients",
    ] {
        let res = client.get(app.url(path)).send().await.unwrap();
        assert_eq!(res.status(), 403, "{path}");
        assert_eq!(res.text().await.unwrap(), "only from the house", "{path}");
    }
    let res = client.get(app.url("/healthz")).send().await.unwrap();
    assert_eq!(res.status(), 200, "a monitor can still probe");
    let res = client
        .get(app.url("/login"))
        .header("x-house", "yes")
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 200, "past the guard, the kit's login answers");
}
