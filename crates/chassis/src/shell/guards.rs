//! Guards every service gets (K10, AR6): a body-size cap, an in-flight
//! cap, a same-origin CSRF rule, a request timeout with exemptions, and a
//! keyed rate limiter for login and tokens. Every number is a knob (AR3);
//! the defaults pass their own validation (HTTPSwitchboard rule).

mod cross_site;
mod csrf;
mod ip_limit;
mod proxy_notice;

pub(crate) use cross_site::cross_site;

use std::collections::HashSet;
use std::net::{IpAddr, SocketAddr};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::body::Body;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use governor::RateLimiter;
use governor::clock::DefaultClock;
use governor::state::keyed::DefaultKeyedStateStore;
use tokio::sync::Semaphore;

use crate::core::error::{Error, Kind};

/// A problem the kit itself noticed at runtime (critic #10): shown on the
/// status page's problems card next to the project's own entries.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KitProblem {
    pub what: String,
    pub why: String,
    pub remedy: String,
}

/// Everything the guard middlewares read; built once by `App`.
#[derive(Clone)]
pub struct Guards {
    pub max_in_flight: Arc<Semaphore>,
    pub retry_after: Duration,
    pub request_timeout: Duration,
    /// Path prefixes the timeout does not apply to (long polls).
    pub timeout_exempt: Arc<HashSet<String>>,
    /// Peers whose `X-Forwarded-*` headers are believed (AR6).
    pub trusted_proxies: Arc<Vec<IpAddr>>,
    /// Problems the guards found while serving (each recorded once).
    pub kit_problems: Arc<Mutex<Vec<KitProblem>>>,
    /// `X-Forwarded-*` seen from an untrusted peer: warned already?
    pub untrusted_proxy_warned: Arc<AtomicBool>,
}

impl Guards {
    pub fn problems(&self) -> Vec<KitProblem> {
        self.kit_problems.lock().expect("kit problems lock").clone()
    }

    fn note_problem(&self, p: KitProblem) {
        let mut v = self.kit_problems.lock().expect("kit problems lock");
        if !v.contains(&p) {
            v.push(p);
        }
    }
}

/// Critic #10: a proxy header from a peer that is not in `trusted_proxies`
/// is ignored (AR6) — and said out loud, once, with the knob that fixes
/// it. Behind Traefik with an empty knob this is the difference between
/// "passkeys silently 404" and a line on the problems card.
pub async fn untrusted_proxy_guard(
    State(g): State<Guards>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    req: Request<Body>,
    next: Next,
) -> Response {
    proxy_notice::untrusted_proxy_guard(State(g), ConnectInfo(peer), req, next).await
}

/// S8: a keyed limiter grows one entry per distinct key and never forgets
/// on its own; prune stale keys every `every`.
pub fn spawn_limiter_pruner<K: std::hash::Hash + Eq + Clone + Send + Sync + 'static>(
    limiter: Arc<KeyedLimiter<K>>,
    every: Duration,
) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(every);
        loop {
            tick.tick().await;
            limiter.retain_recent();
        }
    });
}

/// Parse `<P>_TRUSTED_PROXIES`: comma-separated IPs, empty allowed.
pub fn parse_trusted_proxies(raw: &str) -> Result<Vec<IpAddr>, Error> {
    raw.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| {
            s.parse::<IpAddr>().map_err(|_| {
                Error::config(
                    format!("trusted_proxies entry `{s}` is not an IP address"),
                    "list the proxies' IPs separated by commas, e.g. 10.10.10.1,127.0.0.1",
                )
            })
        })
        .collect()
}

/// The client's address as the guards see it: the last `X-Forwarded-For`
/// hop when the peer is a trusted proxy, else the peer itself.
pub fn client_ip(peer: SocketAddr, headers: &HeaderMap, trusted: &[IpAddr]) -> IpAddr {
    if trusted.contains(&peer.ip())
        && let Some(xff) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok())
        && let Some(last) = xff.split(',').next_back()
        && let Ok(ip) = last.trim().parse::<IpAddr>()
    {
        return ip;
    }
    peer.ip()
}

/// Whether the request arrived over HTTPS as far as we can tell: only a
/// trusted proxy's `X-Forwarded-Proto` counts (AR6). Direct TLS never
/// happens here (W8).
pub fn is_https(peer: SocketAddr, headers: &HeaderMap, trusted: &[IpAddr]) -> bool {
    trusted.contains(&peer.ip())
        && headers
            .get("x-forwarded-proto")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|p| p.eq_ignore_ascii_case("https"))
}

/// Same-origin rule (kyu's): a state-changing request that carries an
/// `Origin` header must come from this host. Requests without `Origin`
/// (curl, scripts) pass — they are not browsers and CSRF is a browser
/// problem. GET/HEAD/OPTIONS always pass.
///
/// CF-7 (2026-09-06): `Sec-Fetch-Site` is consulted first. Every modern
/// browser sets it on every request and no referrer policy blanks it,
/// whereas `Origin` becomes `null` on a same-origin form submit under
/// `no-referrer` — which refused every dashboard form from Chrome on
/// CT 112. `same-origin` and `none` (a typed address, a bookmark) pass;
/// `cross-site` and `same-site` are refused whatever `Origin` says; without
/// the header the `Origin`-against-`Host` rule decides, and `null` stays
/// refused there (a sandboxed frame or a cross-origin redirect sends it).
pub async fn csrf_guard(req: Request<Body>, next: Next) -> Response {
    csrf::csrf_guard(req, next).await
}

/// In-flight cap: over the limit → 503 with `Retry-After` (K10).
///
/// Static files do not count (Habits, 2026-11-01): a cold page preloads its
/// whole module graph at once (114 requests), so the 64-request cap answered
/// 503 to about 60 of them, and a browser never fetches an ES module again
/// after a 503, which left the page on its loading screen. A static file is
/// served from memory or a small disk read; the cap is for the handlers that
/// do work.
pub async fn in_flight_guard(State(g): State<Guards>, req: Request<Body>, next: Next) -> Response {
    if is_static_file(req.method(), req.uri().path()) {
        return next.run(req).await;
    }
    match g.max_in_flight.clone().try_acquire_owned() {
        Ok(_permit) => next.run(req).await,
        Err(_) => overloaded(g.retry_after, "the service is at its in-flight limit"),
    }
}

/// File types a browser fetches as part of a page (scripts, styles, fonts,
/// images, source maps, the manifest).
const STATIC_EXTENSIONS: &[&str] = &[
    "js",
    "mjs",
    "css",
    "map",
    "woff2",
    "woff",
    "ttf",
    "png",
    "svg",
    "ico",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "webmanifest",
];

/// A GET or HEAD for a page asset: anything under `/static/`, or a path whose
/// last segment ends in one of [`STATIC_EXTENSIONS`] (a web app's own files).
pub(crate) fn is_static_file(method: &axum::http::Method, path: &str) -> bool {
    if method != axum::http::Method::GET && method != axum::http::Method::HEAD {
        return false;
    }
    if path.starts_with("/static/") {
        return true;
    }
    let last = path.rsplit('/').next().unwrap_or("");
    last.rsplit_once('.')
        .is_some_and(|(_, ext)| STATIC_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

/// Request timeout with per-prefix exemptions (critic #14).
pub async fn timeout_guard(State(g): State<Guards>, req: Request<Body>, next: Next) -> Response {
    let path = req.uri().path().to_string();
    if g.timeout_exempt.iter().any(|p| path.starts_with(p)) {
        return next.run(req).await;
    }
    match tokio::time::timeout(g.request_timeout, next.run(req)).await {
        Ok(res) => res,
        Err(_) => Error::new(
            Kind::Overloaded,
            format!("request to {path} exceeded {} s", g.request_timeout.as_secs()),
            "retry; if this route legitimately takes longer, exempt it with App::exempt_from_timeout",
        )
        .into_response()
        .with_status(StatusCode::REQUEST_TIMEOUT),
    }
}

fn overloaded(retry_after: Duration, what: &str) -> Response {
    let mut res = Error::new(
        Kind::Overloaded,
        what.to_string(),
        format!("retry after {} s", retry_after.as_secs()),
    )
    .into_response();
    res.headers_mut().insert(
        header::RETRY_AFTER,
        HeaderValue::from_str(&retry_after.as_secs().to_string()).expect("digits"),
    );
    res
}

/// A keyed limiter (GCRA) shared by one route or one purpose.
pub type KeyedLimiter<K> = RateLimiter<K, DefaultKeyedStateStore<K>, DefaultClock>;

/// `per_period` events every `period`, allowing bursts of `burst`.
pub fn keyed_limiter<K: std::hash::Hash + Eq + Clone>(
    per_period: u32,
    period: Duration,
    burst: u32,
) -> Result<Arc<KeyedLimiter<K>>, Error> {
    ip_limit::keyed_limiter(per_period, period, burst)
}

/// Middleware state for an IP-keyed limit on one route (login).
#[derive(Clone)]
pub struct IpLimit {
    pub limiter: Arc<KeyedLimiter<IpAddr>>,
    pub guards: Guards,
}

/// Rate-limit by client IP; over the limit → 429 with `Retry-After`.
pub async fn ip_rate_limit(
    State(l): State<IpLimit>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    req: Request<Body>,
    next: Next,
) -> Response {
    ip_limit::ip_rate_limit(State(l), ConnectInfo(peer), req, next).await
}

/// Small helper: replace the status a kit error rendered with.
trait WithStatus {
    fn with_status(self, status: StatusCode) -> Response;
}

impl WithStatus for Response {
    fn with_status(mut self, status: StatusCode) -> Response {
        *self.status_mut() = status;
        self
    }
}

#[cfg(test)]
mod tests;
