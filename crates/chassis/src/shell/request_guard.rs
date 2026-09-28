//! A project's own gate in front of every route (feat-guard-1).
//!
//! Some services must refuse a request before the kit does anything with
//! it — before `/login` renders, before `/static` answers, before a client
//! token is even looked at. The homelab admin dashboard is the case: it is
//! reached through a Cloudflare tunnel and Traefik, and every request must
//! carry a valid Cloudflare Access assertion and come from the house's
//! public address before the kit's own login is allowed to run.
//!
//! [`crate::App::request_guard`] registers such a check. Guards run in the
//! order they were registered, after the kit's proxy handling (so the
//! client address is known) and before every route, the kit's own included;
//! the first refusal is the answer. `/healthz` is always exempt so a
//! monitor can probe the service; [`crate::App::request_guard_exempt`] adds
//! more prefixes. A service that registers no guard gets no layer at all.

use std::future::Future;
use std::net::{IpAddr, SocketAddr};
use std::pin::Pin;
use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderMap, Method};
use axum::middleware::Next;
use axum::response::Response;

/// What a guard sees of a request: enough to decide, nothing to consume.
/// Built by the kit only; `#[non_exhaustive]` so a field added later does
/// not break a guard.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub struct GuardRequest {
    pub method: Method,
    /// The path without the query string.
    pub path: String,
    pub headers: HeaderMap,
    /// The TCP peer: the proxy when there is one.
    pub peer: SocketAddr,
    /// Whether `peer` is in `<PREFIX>_TRUSTED_PROXIES`. Only then may a
    /// guard believe a header a proxy set (`Cf-Connecting-IP`,
    /// `Cf-Access-Jwt-Assertion`, `X-Forwarded-For`); from anyone else the
    /// same header is whatever the client chose to send.
    pub from_trusted_proxy: bool,
    /// The client address as the kit's guards see it: the last
    /// `X-Forwarded-For` hop from a trusted proxy, else the peer.
    pub client_ip: IpAddr,
}

/// A guard's verdict: `Ok(())` lets the request through, `Err(response)` is
/// sent as it is (status, headers, body) and nothing behind it runs.
pub type GuardFuture = Pin<Box<dyn Future<Output = Result<(), Response>> + Send>>;

/// A registered guard.
pub type RequestGuard = Arc<dyn Fn(GuardRequest) -> GuardFuture + Send + Sync>;

#[derive(Clone)]
struct GuardState {
    guards: Arc<Vec<RequestGuard>>,
    exempt: Arc<Vec<String>>,
    trusted: Arc<Vec<IpAddr>>,
}

/// Wrap `router` with the guards; no guards, no layer.
pub(crate) fn apply(
    router: Router,
    guards: Vec<RequestGuard>,
    mut exempt: Vec<String>,
    trusted: Arc<Vec<IpAddr>>,
) -> Router {
    if guards.is_empty() {
        return router;
    }
    exempt.push("/healthz".to_string());
    router.layer(axum::middleware::from_fn_with_state(
        GuardState {
            guards: Arc::new(guards),
            exempt: Arc::new(exempt),
            trusted,
        },
        run_guards,
    ))
}

fn is_exempt(path: &str, exempt: &[String]) -> bool {
    exempt.iter().any(|p| {
        path == p
            || path
                .strip_prefix(p.as_str())
                .is_some_and(|rest| rest.starts_with('/') || p.ends_with('/'))
    })
}

async fn run_guards(
    State(s): State<GuardState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let path = req.uri().path().to_string();
    if is_exempt(&path, &s.exempt) {
        return next.run(req).await;
    }
    let seen = GuardRequest {
        method: req.method().clone(),
        path,
        headers: req.headers().clone(),
        peer,
        from_trusted_proxy: s.trusted.contains(&peer.ip()),
        client_ip: crate::shell::guards::client_ip(peer, req.headers(), &s.trusted),
    };
    for guard in s.guards.iter() {
        if let Err(refusal) = guard(seen.clone()).await {
            return refusal;
        }
    }
    next.run(req).await
}

#[cfg(test)]
#[allow(clippy::result_large_err)] // a refusal is a whole response, by design
mod tests {
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
}
