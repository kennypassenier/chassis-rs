//! Tests of the in-flight cap, the timeout and the keyed limiter: the
//! limits `guards` enforces. Split from `tests` to keep each file small.

use super::*;

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

/// Habits, 2026-11-01: a page's module graph must never meet the cap, or
/// the browser keeps the 503 for that module and the page never starts.
#[tokio::test]
async fn static_files_pass_the_in_flight_cap_and_handlers_do_not() {
    let g = guards(1, 5000);
    let app = Router::new()
        .route(
            "/slow",
            get(|| async {
                tokio::time::sleep(Duration::from_millis(200)).await;
                "ok"
            }),
        )
        .route("/static/{*f}", get(|| async { "file" }))
        .route("/js/{*f}", get(|| async { "file" }))
        .layer(axum::middleware::from_fn_with_state(
            g.clone(),
            in_flight_guard,
        ));
    let a = app.clone();
    let held = tokio::spawn(async move {
        a.oneshot(Request::builder().uri("/slow").body(Body::empty()).unwrap())
            .await
            .unwrap()
    });
    tokio::time::sleep(Duration::from_millis(50)).await;
    for uri in ["/static/kp/dist/kp-themes.min.js", "/js/pages/today.js"] {
        let res = app
            .clone()
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(
            res.status(),
            StatusCode::OK,
            "{uri} passes while the cap is full"
        );
    }
    let api = app
        .oneshot(Request::builder().uri("/slow").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(
        api.status(),
        StatusCode::SERVICE_UNAVAILABLE,
        "a handler still meets the cap"
    );
    held.await.unwrap();
    assert!(
        !is_static_file(&axum::http::Method::POST, "/static/x.js"),
        "only reads"
    );
    assert!(!is_static_file(&axum::http::Method::GET, "/api/kit/status"));
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
