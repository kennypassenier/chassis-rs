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
mod tests;
