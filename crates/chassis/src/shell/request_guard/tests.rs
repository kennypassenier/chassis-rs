//! Unit tests for `request_guard`; kept in their own file so the module stays small.

use super::*;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use tower::ServiceExt;

fn guard<F>(f: F) -> RequestGuard
where
    F: Fn(GuardRequest) -> Result<(), Response> + Send + Sync + 'static,
{
    let f = Arc::new(f);
    Arc::new(move |r| {
        let f = f.clone();
        Box::pin(async move { f(r) })
    })
}

fn app(guards: Vec<RequestGuard>, exempt: Vec<String>, trusted: Vec<IpAddr>) -> Router {
    let routes = Router::new()
        .route("/login", get(|| async { "login page" }))
        .route("/healthz", get(|| async { "alive" }))
        .route("/static/{*p}", get(|| async { "asset" }));
    apply(routes, guards, exempt, Arc::new(trusted))
}

async fn call(r: &Router, path: &str, peer: &str, headers: &[(&str, &str)]) -> (u16, String) {
    let mut req = Request::get(path);
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    let mut req = req.body(Body::empty()).unwrap();
    req.extensions_mut()
        .insert(ConnectInfo(peer.parse::<SocketAddr>().unwrap()));
    let res = r.clone().oneshot(req).await.unwrap();
    let status = res.status().as_u16();
    let body = axum::body::to_bytes(res.into_body(), 1 << 16)
        .await
        .unwrap();
    (status, String::from_utf8_lossy(&body).into_owned())
}

fn house_only() -> RequestGuard {
    guard(|r| {
        let ip = r
            .headers
            .get("cf-connecting-ip")
            .filter(|_| r.from_trusted_proxy)
            .and_then(|v| v.to_str().ok());
        if ip == Some("203.0.113.7") {
            Ok(())
        } else {
            Err((StatusCode::FORBIDDEN, "not from the house").into_response())
        }
    })
}

#[tokio::test]
async fn a_refusal_comes_before_every_route_the_kits_own_included() {
    let r = app(
        vec![house_only()],
        vec![],
        vec!["10.10.10.4".parse().unwrap()],
    );
    for path in ["/login", "/static/kp/dist/kp-themes.css", "/nowhere"] {
        let (status, body) = call(&r, path, "10.10.10.4:5000", &[]).await;
        assert_eq!(
            (status, body.as_str()),
            (403, "not from the house"),
            "{path}"
        );
    }
    let (status, body) = call(
        &r,
        "/login",
        "10.10.10.4:5000",
        &[("cf-connecting-ip", "203.0.113.7")],
    )
    .await;
    assert_eq!((status, body.as_str()), (200, "login page"));
}

#[tokio::test]
async fn a_proxy_header_from_an_untrusted_peer_is_not_believed() {
    let r = app(
        vec![house_only()],
        vec![],
        vec!["10.10.10.4".parse().unwrap()],
    );
    let (status, _) = call(
        &r,
        "/login",
        "192.168.1.50:5000",
        &[("cf-connecting-ip", "203.0.113.7")],
    )
    .await;
    assert_eq!(status, 403, "a client can send any header it likes");
}

#[tokio::test]
async fn healthz_and_named_prefixes_are_exempt() {
    let r = app(vec![house_only()], vec!["/static".into()], vec![]);
    assert_eq!(call(&r, "/healthz", "1.2.3.4:1", &[]).await.0, 200);
    assert_eq!(call(&r, "/static/x.css", "1.2.3.4:1", &[]).await.0, 200);
    assert_eq!(
        call(&r, "/staticky", "1.2.3.4:1", &[]).await.0,
        403,
        "a prefix is a path segment, not a string prefix: /staticky is guarded"
    );
    assert_eq!(call(&r, "/login", "1.2.3.4:1", &[]).await.0, 403);
}

#[tokio::test]
async fn guards_run_in_order_and_the_first_refusal_wins() {
    let first = guard(|_| Err((StatusCode::FORBIDDEN, "first").into_response()));
    let second = guard(|_| Err((StatusCode::UNAUTHORIZED, "second").into_response()));
    let r = app(vec![first, second], vec![], vec![]);
    assert_eq!(
        call(&r, "/login", "1.2.3.4:1", &[]).await,
        (403, "first".into())
    );
}

#[tokio::test]
async fn no_guard_means_no_layer() {
    let r = app(vec![], vec![], vec![]);
    // Without ConnectInfo a layer would fail to extract; the bare router
    // answers.
    let res = r
        .oneshot(Request::get("/login").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
}

#[tokio::test]
async fn the_guard_sees_the_client_address_the_kit_sees() {
    let seen = Arc::new(std::sync::Mutex::new(None));
    let s2 = seen.clone();
    let g = guard(move |r| {
        *s2.lock().unwrap() = Some((r.client_ip, r.from_trusted_proxy, r.path.clone()));
        Ok(())
    });
    let r = app(vec![g], vec![], vec!["10.10.10.4".parse().unwrap()]);
    call(
        &r,
        "/login?next=/app/",
        "10.10.10.4:5000",
        &[("x-forwarded-for", "198.51.100.9")],
    )
    .await;
    assert_eq!(
        *seen.lock().unwrap(),
        Some(("198.51.100.9".parse().unwrap(), true, "/login".into()))
    );
}
