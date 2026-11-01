//! The test-it field sends the edited body to the test route.

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use chassis::{App, AppSpec};

use crate::fixtures::{env, http, id_of, issue, login};

// kit-kp11 (clients-manage, round 3): the Test it field sends the body the
// reader edited, and starts from the test route's own; without a body the
// request is the route's, as before (the palette's "send a test" posts none).
// A body past the cap is refused with the kit's error. The send goes to the
// service's own address, so this one listens on a free port, not port 0.
async fn record_body(State(seen): State<Arc<Mutex<Vec<String>>>>, body: String) -> StatusCode {
    seen.lock().unwrap().push(body);
    StatusCode::ACCEPTED
}

#[tokio::test]
async fn the_test_it_field_sends_the_edited_body_to_the_test_route() {
    let port = {
        let probe = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        probe.local_addr().unwrap().port()
    };
    let dir = tempfile::tempdir().unwrap();
    let mut vars = env(dir.path());
    vars.insert("VOCABDEMO_LISTEN".into(), format!("127.0.0.1:{port}"));
    let mut app = App::from_args_with_env(
        AppSpec {
            name: "vocabdemo",
            version: "0.0.0",
            ..Default::default()
        },
        vec!["vocabdemo".into()],
        vars,
        Router::new(),
    )
    .unwrap();
    let seen: Arc<Mutex<Vec<String>>> = Default::default();
    app.test_route(
        "POST",
        "/v1/events",
        "application/json",
        r#"{"hello":"route"}"#,
    );
    app.api_routes(
        Router::new()
            .route("/v1/events", post(record_body))
            .with_state(seen.clone()),
    );
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let (_, issued) = issue(addr, &cookie, "job-tracker").await;
    let id = id_of(&issued);

    let (_, _, page) = http(
        addr,
        "GET",
        &format!("/clients/{id}"),
        &[("Cookie", &cookie)],
        "",
    )
    .await;
    assert!(
        page.contains("data-manage-body") && page.contains("data-kp-json=\"strict\""),
        "the field starts from a JSON route and checks JSON: {page}"
    );

    let path = format!("/api/clients/{id}/test");
    // No body: the route's own.
    let (status, _, body) = http(addr, "POST", &path, &[("Cookie", &cookie)], "").await;
    assert_eq!(status, 200, "{body}");
    // The edited body.
    let json = [
        ("Cookie", cookie.as_str()),
        ("Content-Type", "application/json"),
    ];
    let edited = r#"{"body":"{\"hello\":\"edited\"}"}"#;
    let (status, _, body) = http(addr, "POST", &path, &json, edited).await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(
        *seen.lock().unwrap(),
        vec![
            r#"{"hello":"route"}"#.to_string(),
            r#"{"hello":"edited"}"#.to_string()
        ]
    );
    // Past the cap: refused with the kit's error, nothing sent.
    let huge = serde_json::json!({ "body": "x".repeat(70 * 1024) }).to_string();
    let (status, _, body) = http(addr, "POST", &path, &json, &huge).await;
    assert_eq!(status, 400, "{body}");
    assert_eq!(seen.lock().unwrap().len(), 2);
    running.stop().await;
}
