//! Unit tests for `guards`; kept in their own file so the module stays small.

use super::*;
use axum::Router;
use axum::routing::{get, post};
use tower::ServiceExt;

/// Critic #10: X-Forwarded-* from an untrusted peer is ignored, warned
/// about once, and shows up on the problems card exactly once.
#[tokio::test]
async fn untrusted_proxy_headers_are_noted_once() {
    use axum::Router;
    use axum::routing::get;
    use tower::ServiceExt;
    let g = guards(4, 1000);
    let app = Router::new().route("/", get(|| async { "ok" })).layer(
        axum::middleware::from_fn_with_state(g.clone(), untrusted_proxy_guard),
    );
    let peer: SocketAddr = "192.168.1.9:5555".parse().unwrap();
    for _ in 0..3 {
        let req = Request::builder()
            .uri("/")
            .header("x-forwarded-proto", "https")
            .extension(ConnectInfo(peer))
            .body(Body::empty())
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK, "the request itself is served");
    }
    let problems = g.problems();
    assert_eq!(
        problems.len(),
        1,
        "recorded once, not per request: {problems:?}"
    );
    assert!(problems[0].remedy.contains("TRUSTED_PROXIES"));
    // Plain requests without proxy headers record nothing.
    let quiet = guards(4, 1000);
    let app = Router::new().route("/", get(|| async { "ok" })).layer(
        axum::middleware::from_fn_with_state(quiet.clone(), untrusted_proxy_guard),
    );
    let req = Request::builder()
        .uri("/")
        .extension(ConnectInfo(peer))
        .body(Body::empty())
        .unwrap();
    app.oneshot(req).await.unwrap();
    assert!(quiet.problems().is_empty());
}

fn guards(max_in_flight: usize, timeout_ms: u64) -> Guards {
    Guards {
        max_in_flight: Arc::new(Semaphore::new(max_in_flight)),
        retry_after: Duration::from_secs(5),
        request_timeout: Duration::from_millis(timeout_ms),
        timeout_exempt: Arc::new(HashSet::from(["/long".to_string()])),
        trusted_proxies: Arc::new(vec!["10.10.10.1".parse().unwrap()]),
        kit_problems: Arc::new(std::sync::Mutex::new(Vec::new())),
        untrusted_proxy_warned: Arc::new(std::sync::atomic::AtomicBool::new(false)),
    }
}

#[test]
fn trusted_proxies_parse_and_client_ip_follows_xff_only_from_them() {
    assert_eq!(parse_trusted_proxies("").unwrap(), Vec::<IpAddr>::new());
    assert_eq!(
        parse_trusted_proxies(" 10.10.10.1, 127.0.0.1")
            .unwrap()
            .len(),
        2
    );
    assert!(parse_trusted_proxies("traefik").is_err());

    let trusted: Vec<IpAddr> = vec!["10.10.10.1".parse().unwrap()];
    let mut h = HeaderMap::new();
    h.insert(
        "x-forwarded-for",
        HeaderValue::from_static("192.168.1.5, 10.10.10.1"),
    );
    let via_proxy: SocketAddr = "10.10.10.1:4000".parse().unwrap();
    let direct: SocketAddr = "192.168.1.9:4000".parse().unwrap();
    assert_eq!(client_ip(via_proxy, &h, &trusted).to_string(), "10.10.10.1");
    assert_eq!(client_ip(direct, &h, &trusted).to_string(), "192.168.1.9");

    let mut hp = HeaderMap::new();
    hp.insert("x-forwarded-proto", HeaderValue::from_static("https"));
    assert!(is_https(via_proxy, &hp, &trusted));
    assert!(
        !is_https(direct, &hp, &trusted),
        "a spoofed header from an untrusted peer is ignored"
    );
}

#[tokio::test]
async fn csrf_refuses_cross_origin_posts_and_passes_scripts() {
    let app = Router::new()
        .route("/act", post(|| async { "did" }))
        .layer(axum::middleware::from_fn(csrf_guard));
    let cross = Request::builder()
        .method("POST")
        .uri("/act")
        .header("host", "inbox.lan:8080")
        .header("origin", "http://evil.example")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        app.clone().oneshot(cross).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
    let same = Request::builder()
        .method("POST")
        .uri("/act")
        .header("host", "inbox.lan:8080")
        .header("origin", "http://inbox.lan:8080")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        app.clone().oneshot(same).await.unwrap().status(),
        StatusCode::OK
    );
    let script = Request::builder()
        .method("POST")
        .uri("/act")
        .body(Body::empty())
        .unwrap();
    assert_eq!(app.oneshot(script).await.unwrap().status(), StatusCode::OK);
}

/// CF-7 (2026-09-06, live on CT 112): a browser submitting a dashboard
/// form is a navigation, and under `referrer-policy: no-referrer` the
/// Fetch standard makes it send `Origin: null` — which the host
/// comparison refused, login included. Modern browsers also send
/// `Sec-Fetch-Site`, which says what the Origin cannot after a policy
/// blanked it. This is exactly what Chrome sent.
#[tokio::test]
async fn csrf_passes_a_same_origin_browser_form_post_and_refuses_cross_site() {
    let app = Router::new()
        .route("/act", post(|| async { "did" }))
        .layer(axum::middleware::from_fn(csrf_guard));
    let chrome = |site: &'static str, origin: &'static str| {
        Request::builder()
            .method("POST")
            .uri("/act")
            .header("host", "almanac.kp-soft.dev")
            .header("origin", origin)
            .header("sec-fetch-site", site)
            .header("sec-fetch-mode", "navigate")
            .body(Body::empty())
            .unwrap()
    };
    assert_eq!(
        app.clone()
            .oneshot(chrome("same-origin", "null"))
            .await
            .unwrap()
            .status(),
        StatusCode::OK,
        "a same-origin form submit under no-referrer carries Origin: null and must pass"
    );
    for site in ["cross-site", "same-site"] {
        assert_eq!(
            app.clone()
                .oneshot(chrome(site, "https://almanac.kp-soft.dev"))
                .await
                .unwrap()
                .status(),
            StatusCode::FORBIDDEN,
            "{site}: Sec-Fetch-Site wins over a matching Origin"
        );
    }
    // Without Sec-Fetch-Site (an older browser) `null` stays refused:
    // it is also what a sandboxed iframe or a cross-origin redirect sends.
    let bare_null = Request::builder()
        .method("POST")
        .uri("/act")
        .header("host", "almanac.kp-soft.dev")
        .header("origin", "null")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        app.oneshot(bare_null).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn in_flight_cap_answers_503_with_retry_after() {
    let g = guards(1, 5000);
    let app = Router::new()
        .route(
            "/slow",
            get(|| async {
                tokio::time::sleep(Duration::from_millis(200)).await;
                "ok"
            }),
        )
        .layer(axum::middleware::from_fn_with_state(
            g.clone(),
            in_flight_guard,
        ));
    let a = app.clone();
    let first = tokio::spawn(async move {
        a.oneshot(Request::builder().uri("/slow").body(Body::empty()).unwrap())
            .await
            .unwrap()
    });
    tokio::time::sleep(Duration::from_millis(50)).await;
    let second = app
        .oneshot(Request::builder().uri("/slow").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(second.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(second.headers().get("retry-after").unwrap(), "5");
    assert_eq!(first.await.unwrap().status(), StatusCode::OK);
}

#[tokio::test]
async fn timeout_applies_except_to_exempt_prefixes() {
    let g = guards(8, 50);
    let slow = || async {
        tokio::time::sleep(Duration::from_millis(150)).await;
        "late"
    };
    let app = Router::new()
        .route("/short", get(slow))
        .route("/long", get(slow))
        .layer(axum::middleware::from_fn_with_state(g, timeout_guard));
    let r = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/short")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r.status(), StatusCode::REQUEST_TIMEOUT);
    let r = app
        .oneshot(Request::builder().uri("/long").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(r.status(), StatusCode::OK);
}

#[test]
fn keyed_limiter_allows_burst_then_refuses() {
    let l = keyed_limiter::<IpAddr>(10, Duration::from_secs(60), 3).unwrap();
    let ip: IpAddr = "192.168.0.7".parse().unwrap();
    assert!(l.check_key(&ip).is_ok());
    assert!(l.check_key(&ip).is_ok());
    assert!(l.check_key(&ip).is_ok());
    assert!(
        l.check_key(&ip).is_err(),
        "fourth attempt within the burst window is refused"
    );
    let other: IpAddr = "192.168.0.8".parse().unwrap();
    assert!(l.check_key(&other).is_ok(), "keys are independent");
    assert!(keyed_limiter::<IpAddr>(0, Duration::from_secs(1), 1).is_err());
}
