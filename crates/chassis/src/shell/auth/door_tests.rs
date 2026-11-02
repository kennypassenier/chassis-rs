//! The API door's 401 remedy: vocabulary-aware for a program that sent a
//! token, unchanged for a caller that sent nothing.

use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use axum::middleware::from_fn_with_state;
use axum::routing::get;

use super::*;

fn auth_state() -> AuthState {
    AuthState {
        name: "t",
        secrets: Some(
            Secrets::parse(
                "T",
                Some("a-long-enough-login-token"),
                Some(&"ab".repeat(32)),
            )
            .unwrap()
            .unwrap(),
        ),
        clients: Arc::new(crate::shell::store::MemoryClientStore::default()),
        sessions: Arc::new(SessionStore::in_memory()),
        session_ttl_secs: 60,
        remember_me_secs: 60,
        guards: Guards {
            max_in_flight: Arc::new(tokio::sync::Semaphore::new(1)),
            retry_after: Duration::from_secs(1),
            request_timeout: Duration::from_secs(1),
            timeout_exempt: Arc::new(Default::default()),
            trusted_proxies: Arc::new(vec![]),
            kit_problems: Arc::new(std::sync::Mutex::new(Vec::new())),
            untrusted_proxy_warned: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        },
    }
}

/// Call a guarded route and return the status and raw 401 body.
async fn call(authorization: Option<&str>, hint: Option<DoorHint>) -> (StatusCode, String) {
    let mut app = Router::new()
        .route("/api/x", get(|| async { "ok" }))
        .layer(from_fn_with_state(auth_state(), require_caller));
    if let Some(h) = hint {
        app = app.layer(axum::Extension(h));
    }
    let mut req = Request::builder().uri("/api/x");
    if let Some(a) = authorization {
        req = req.header(header::AUTHORIZATION, a);
    }
    let mut req = req.body(Body::empty()).unwrap();
    req.extensions_mut().insert(ConnectInfo(
        "127.0.0.1:9".parse::<std::net::SocketAddr>().unwrap(),
    ));
    let res = tower::ServiceExt::oneshot(app, req).await.unwrap();
    let status = res.status();
    let bytes = axum::body::to_bytes(res.into_body(), 1 << 16)
        .await
        .unwrap();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}

fn sources() -> Option<DoorHint> {
    Some(DoorHint::new("source", "Sources", "/clients"))
}

#[tokio::test]
async fn unknown_bearer_gets_a_remedy_in_the_apps_vocabulary() {
    let (status, body) = call(Some("Bearer rotated-or-mistyped"), sources()).await;
    println!("AFTER (unknown bearer): {body}");
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(body.contains("\"error\":\"missing or invalid credentials\""));
    assert!(body.contains("token issued for this source on the Sources page"));
    assert!(!body.contains("log in on /login"));
}

#[tokio::test]
async fn no_authorization_header_keeps_the_original_remedy() {
    let (status, body) = call(None, sources()).await;
    println!("BEFORE/no header: {body}");
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(body.contains("\"error\":\"missing or invalid credentials\""));
    assert!(body.contains("send Authorization: Bearer <client token>, or log in on /login"));
}

#[tokio::test]
async fn a_bearer_without_any_hint_keeps_the_original_remedy() {
    let (_, body) = call(Some("Bearer nope"), None).await;
    assert!(body.contains("or log in on /login"));
}
