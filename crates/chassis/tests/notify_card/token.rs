//! The bearer token for the primary target (`<P>_NOTIFY_TOKEN`): a fake kyu
//! that REQUIRES it, the fallback and the Test button, and the proof that
//! the value shows up nowhere: not in the card's JSON, not on the page, not
//! in the knob table or the printed config, not in a refusal.

use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use chassis::testing::TestApp;
use serde_json::json;

use crate::fixtures::{SERIAL, Seen, receiver, spec, start, until};

const TOKEN: &str = "k7Qp2mZ9xV4nB8cD1fG5hJ3rT6wY0aLs";

/// A kyu that answers 401 unless `Authorization: Bearer <TOKEN>` is sent.
async fn kyu_requiring_bearer() -> (String, Seen) {
    let seen: Seen = Arc::default();
    let s2 = seen.clone();
    let app = Router::new().route(
        "/t/ops",
        post(move |headers: HeaderMap, body: String| {
            let s2 = s2.clone();
            async move {
                let ok = headers
                    .get("authorization")
                    .and_then(|v| v.to_str().ok())
                    .is_some_and(|v| v == format!("Bearer {TOKEN}"));
                s2.lock().unwrap().push((headers, body));
                (
                    if ok {
                        StatusCode::CREATED
                    } else {
                        StatusCode::UNAUTHORIZED
                    },
                    "{}",
                )
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{addr}/t/ops"), seen)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_right_token_delivers_and_the_page_and_json_never_show_it() {
    let _one = SERIAL.lock().await;
    let (kyu, seen) = kyu_requiring_bearer().await;
    let (mut app, n) = start(
        "nt-ok",
        "NT_OK",
        &[("NOTIFY_URL", &kyu), ("NOTIFY_TOKEN", TOKEN)],
        None,
    )
    .await;
    n.emit("update.failed", "1.0.0", "it broke");
    let v = until(&app, "delivered with the token", |v| {
        v["last_delivery"]["via"] == "primary" && v["outbox"]["waiting"] == 0
    })
    .await;
    assert_eq!(
        v["token"],
        json!({"set": true, "env": "NT_OK_NOTIFY_TOKEN"})
    );
    let (_, test) = app.post_json("/api/kit/notify/test", json!({})).await;
    for text in [v.to_string(), test.to_string(), app.page("/").await.1] {
        assert!(!text.contains(TOKEN), "the token leaked");
    }
    let (_, js) = app.page("/static/chassis/notify-card-markup.js").await;
    assert!(!js.contains(TOKEN));
    assert!(seen.lock().unwrap().iter().all(|(h, _)| {
        h.get("authorization").unwrap().to_str().unwrap() == format!("Bearer {TOKEN}")
    }));
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn without_the_token_the_hub_says_401_and_the_last_error_names_the_variable() {
    let _one = SERIAL.lock().await;
    let (kyu, seen) = kyu_requiring_bearer().await;
    let (mut app, n) = start("nt-no", "NT_NO", &[("NOTIFY_URL", &kyu)], None).await;
    n.emit("update.failed", "1.0.0", "it broke");
    let v = until(&app, "the 401 is recorded", |v| !v["last_error"].is_null()).await;
    let err = v["last_error"]["message"].as_str().unwrap();
    assert!(
        err.contains("HTTP 401") && err.contains("NT_NO_NOTIFY_TOKEN"),
        "{err}"
    );
    assert!(err.contains("none is set"), "{err}");
    assert_eq!(v["token"]["set"], false);
    assert!(
        v["outbox"]["waiting"].as_u64() >= Some(1),
        "a refused message stays on disk"
    );
    assert!(
        seen.lock()
            .unwrap()
            .iter()
            .all(|(h, _)| h.get("authorization").is_none())
    );
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_wrong_token_is_called_wrong_and_never_echoed() {
    let _one = SERIAL.lock().await;
    let (kyu, _seen) = kyu_requiring_bearer().await;
    let wrong = "wrongTokenwrongTokenwrongToken99";
    let (mut app, n) = start(
        "nt-bad",
        "NT_BAD",
        &[("NOTIFY_URL", &kyu), ("NOTIFY_TOKEN", wrong)],
        None,
    )
    .await;
    n.emit("update.failed", "1.0.0", "it broke");
    let v = until(&app, "the 401 is recorded", |v| !v["last_error"].is_null()).await;
    let err = v["last_error"]["message"].as_str().unwrap();
    assert!(
        err.contains("wrong or revoked") && !err.contains(wrong),
        "{err}"
    );
    assert!(!v.to_string().contains(wrong));
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_fallback_never_gets_the_token_and_the_test_button_sends_it_to_the_primary_only() {
    let _one = SERIAL.lock().await;
    let (kyu, kyu_seen) = kyu_requiring_bearer().await;
    let (fallback, fb_seen) = receiver(200, false).await;
    let (mut app, n) = start(
        "nt-fb",
        "NT_FB",
        &[
            ("NOTIFY_URL", &kyu),
            ("NOTIFY_FALLBACK_URL", &fallback),
            ("NOTIFY_TOKEN", TOKEN),
        ],
        None,
    )
    .await;
    // The Test button: both targets asked, only the primary gets the token.
    let (s, body) = app.post_json("/api/kit/notify/test", json!({})).await;
    assert_eq!(s, 200, "{body}");
    assert_eq!(body["results"][0]["outcome"], "delivered", "{body}");
    assert!(
        kyu_seen
            .lock()
            .unwrap()
            .iter()
            .any(|(h, b)| { b.contains("notify.test") && h.get("authorization").is_some() })
    );
    // The test also asked the fallback; it must have carried no credential.
    let _ = &n;
    tokio::time::sleep(Duration::from_millis(100)).await;
    {
        let fb = fb_seen.lock().unwrap();
        assert!(!fb.is_empty(), "the test reached the fallback");
        assert!(fb.iter().all(|(h, _)| h.get("authorization").is_none()));
    }
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_fallback_request_after_a_primary_401_carries_no_authorization() {
    let _one = SERIAL.lock().await;
    // Primary demands a different token than ours, so it answers 401 and the
    // message falls through to the fallback.
    let (kyu, _s) = kyu_requiring_bearer().await;
    let (fallback, fb_seen) = receiver(200, false).await;
    let (mut app, n) = start(
        "nt-fb2",
        "NT_FB2",
        &[
            ("NOTIFY_URL", &kyu),
            ("NOTIFY_FALLBACK_URL", &fallback),
            ("NOTIFY_TOKEN", "anotherTokenanotherToken123456"),
        ],
        None,
    )
    .await;
    n.emit("update.failed", "1.0.0", "it broke");
    until(&app, "delivered via the fallback", |v| {
        v["last_delivery"]["via"] == "fallback"
    })
    .await;
    assert!(
        fb_seen
            .lock()
            .unwrap()
            .iter()
            .all(|(h, _)| h.get("authorization").is_none())
    );
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn an_unusable_token_or_one_in_the_file_refuses_the_start_without_echo() {
    let _one = SERIAL.lock().await;
    for bad in [
        "abc123",
        "has a space in it 1234567890",
        "tab\there1234567890123",
    ] {
        let env = [("NT_REF_NOTIFY_TOKEN", bad)];
        let e = match TestApp::try_start_with_env(spec("nt-ref"), Router::new(), &env, |_| {}).await
        {
            Ok(_) => panic!("{bad:?} should refuse"),
            Err(e) => e,
        };
        let text = format!("{} {}", e.message, e.remedy);
        assert!(
            text.contains("NT_REF_NOTIFY_TOKEN") && !text.contains(bad),
            "{text}"
        );
    }
}

#[test]
fn the_knob_is_redacted_in_the_table_and_in_the_printed_config() {
    let table = chassis::AppSpec {
        name: "nt",
        ..Default::default()
    }
    .knobs_markdown_for(&["notify"]);
    let row = table
        .lines()
        .find(|l| l.contains("`notify_token`"))
        .expect("row");
    assert!(
        row.contains("(secret)") && row.contains("`NT_NOTIFY_TOKEN`"),
        "{row}"
    );
    assert!(
        !row.contains("--notify-token"),
        "a secret has no flag: {row}"
    );

    let spec = chassis::AppSpec {
        name: "nt",
        ..Default::default()
    };
    let env: BTreeMap<String, String> = [("notify_token".to_string(), TOKEN.to_string())].into();
    let layers = chassis::core::config::Layers {
        env,
        ..Default::default()
    };
    let resolved =
        chassis::core::config::resolve("NT", &spec.knobs(), &layers, &BTreeMap::new()).unwrap();
    let printed = chassis::core::config::render_table(&resolved);
    assert!(
        printed.contains("notify_token") && !printed.contains(TOKEN),
        "{printed}"
    );
}
