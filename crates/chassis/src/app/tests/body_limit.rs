//! `App::body_limit`: a raised request-body cap for chosen routes, while the
//! default cap stays for every other route.

use super::*;

const MIB: usize = 1024 * 1024;

fn echo_len() -> axum::routing::MethodRouter {
    axum::routing::post(|body: axum::body::Bytes| async move { body.len().to_string() })
}

async fn started(raise: Option<(&str, usize)>) -> crate::app::Running {
    let dir = tempfile::tempdir().unwrap();
    let router = Router::new()
        .route("/plain", echo_len())
        .route("/data/import/habits", echo_len())
        .route("/data/imports", echo_len());
    let mut app = from_args_secret(spec(), argv(&secrets_env(dir.path())), router).unwrap();
    if let Some((prefix, bytes)) = raise {
        app.body_limit(prefix, bytes);
    }
    // The state dir must outlive the service for the test's duration.
    std::mem::forget(dir);
    app.start().await.unwrap()
}

/// The status the server answered. A server that refuses a big body by
/// its declared length may close the socket before the client has finished
/// writing; reqwest then reports a failed send, not the 413 that was sent.
/// That is the refusal, so it reads as 413 here.
async fn post(running: &crate::app::Running, path: &str, bytes: usize) -> u16 {
    let sent = reqwest::Client::new()
        .post(format!("http://{}{path}", running.addr))
        .body(vec![b'x'; bytes])
        .send()
        .await;
    match sent {
        Ok(res) => res.status().as_u16(),
        Err(e) if e.is_request() => 413,
        Err(e) => panic!("unexpected client error: {e}"),
    }
}

#[tokio::test]
async fn default_cap_refuses_two_mib_on_an_unmarked_route() {
    let _gate = crate::shell::backup::TEST_GATE.read().await;
    let running = started(Some(("/data/import", 4 * MIB))).await;
    assert_eq!(post(&running, "/plain", 2 * MIB).await, 413);
    assert_eq!(post(&running, "/plain", 1024).await, 200);
    // A whole segment only: `/data/imports` is not under `/data/import`.
    assert_eq!(post(&running, "/data/imports", 2 * MIB).await, 413);
    running.stop().await;
}

#[tokio::test]
async fn marked_route_takes_two_mib_and_refuses_above_its_cap() {
    let _gate = crate::shell::backup::TEST_GATE.read().await;
    let running = started(Some(("/data/import", 4 * MIB))).await;
    assert_eq!(post(&running, "/data/import/habits", 2 * MIB).await, 200);
    // Declared above the raised cap.
    assert_eq!(post(&running, "/data/import/habits", 5 * MIB).await, 413);
    running.stop().await;
}

#[tokio::test]
async fn unusable_cap_is_refused_at_start() {
    let _gate = crate::shell::backup::TEST_GATE.read().await;
    for bad in [("data/import", MIB), ("/data/import", 0)] {
        let dir = tempfile::tempdir().unwrap();
        let mut app =
            from_args_secret(spec(), argv(&secrets_env(dir.path())), Router::new()).unwrap();
        app.body_limit(bad.0, bad.1);
        assert!(app.start().await.is_err(), "{bad:?} must be refused");
    }
}
