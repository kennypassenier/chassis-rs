//! Tests of the configured browser-policy headers, through the same layer
//! order the kit uses (hygiene inside, policy outside).

use super::*;
use axum::Router;
use axum::body::Body;
use axum::http::Request as HttpRequest;
use axum::middleware::from_fn_with_state;
use axum::routing::get;
use tower::ServiceExt;

#[cfg(feature = "webapp")]
const FILES: &[(&str, &[u8])] = &[("index.html", b"<!doctype html><title>t</title>")];

fn app(allowed: &[&str]) -> Router {
    let allowed: Vec<String> = allowed.iter().map(|s| s.to_string()).collect();
    let policy =
        HeaderPolicy::new(&allowed, Arc::new(vec!["10.10.10.1".parse().unwrap()])).unwrap();
    let r = Router::new().route("/v1/ping", get(|| async { "pong" }));
    #[cfg(feature = "webapp")]
    let r = r.merge(
        crate::shell::webapp::WebApp::embedded(FILES)
            .router()
            .unwrap(),
    );
    r.layer(axum::middleware::from_fn(super::super::security_headers))
        .layer(from_fn_with_state(policy, policy_headers))
}

async fn get_from(r: &Router, path: &str, peer: &str, proto: Option<&str>) -> Response {
    let peer: SocketAddr = peer.parse().unwrap();
    let mut req = HttpRequest::get(path).extension(ConnectInfo(peer));
    if let Some(p) = proto {
        req = req.header("x-forwarded-proto", p);
    }
    r.clone()
        .oneshot(req.body(Body::empty()).unwrap())
        .await
        .unwrap()
}

#[tokio::test]
async fn every_kind_of_answer_carries_the_policy_headers() {
    let r = app(&[]);
    for path in ["/v1/ping", "/", "/manifest.webmanifest", "/nothing/here.js"] {
        let res = get_from(&r, path, "192.168.1.9:1", None).await;
        let pp = res.headers()["permissions-policy"].to_str().unwrap();
        for f in ["camera=()", "microphone=()", "geolocation=()"] {
            assert!(pp.contains(f), "{path}: {pp}");
        }
        assert_eq!(
            res.headers()["cross-origin-opener-policy"],
            "same-origin",
            "{path}"
        );
        assert_eq!(
            res.headers()["cross-origin-resource-policy"],
            "same-origin",
            "{path}"
        );
        assert!(
            res.headers().get("strict-transport-security").is_none(),
            "{path}"
        );
    }
}

#[tokio::test]
async fn hsts_only_when_a_trusted_proxy_says_https() {
    let r = app(&[]);
    let via = get_from(&r, "/v1/ping", "10.10.10.1:1", Some("https")).await;
    assert_eq!(
        via.headers()["strict-transport-security"],
        "max-age=31536000"
    );
    let http = get_from(&r, "/v1/ping", "10.10.10.1:1", Some("http")).await;
    assert!(http.headers().get("strict-transport-security").is_none());
    let spoof = get_from(&r, "/v1/ping", "192.168.1.9:1", Some("https")).await;
    assert!(
        spoof.headers().get("strict-transport-security").is_none(),
        "an untrusted peer cannot claim https"
    );
}

#[tokio::test]
async fn an_opt_in_removes_the_deny_for_that_feature_only() {
    let res = get_from(&app(&["camera"]), "/v1/ping", "192.168.1.9:1", None).await;
    let pp = res.headers()["permissions-policy"].to_str().unwrap();
    assert!(
        pp.contains("camera=(self)") && !pp.contains("camera=()"),
        "{pp}"
    );
    assert!(pp.contains("microphone=()"), "{pp}");
}

#[test]
fn a_malformed_feature_name_is_refused_with_a_remedy() {
    let err = HeaderPolicy::new(&["cam era".to_string()], Arc::new(vec![]))
        .err()
        .expect("refused");
    assert!(err.remedy.contains("lowercase"));
}
