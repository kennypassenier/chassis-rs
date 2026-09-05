//! Guards every service gets (K10, AR6): a body-size cap, an in-flight
//! cap, a same-origin CSRF rule, a request timeout with exemptions, and a
//! keyed rate limiter for login and tokens. Every number is a knob (AR3);
//! the defaults pass their own validation (HTTPSwitchboard rule).

use std::collections::HashSet;
use std::net::{IpAddr, SocketAddr};
use std::num::NonZeroU32;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::body::Body;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use governor::clock::DefaultClock;
use governor::state::keyed::DefaultKeyedStateStore;
use governor::{Quota, RateLimiter};
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
    let forwarded = req.headers().contains_key("x-forwarded-for")
        || req.headers().contains_key("x-forwarded-proto");
    if forwarded
        && !g.trusted_proxies.contains(&peer.ip())
        && !g.untrusted_proxy_warned.swap(true, Ordering::SeqCst)
    {
        tracing::warn!(
            peer = %peer.ip(),
            "X-Forwarded-* headers arrive from a peer that is not in trusted_proxies; they are ignored (client IP = proxy IP, no https, no passkeys)"
        );
        g.note_problem(KitProblem {
            what: format!("proxy headers from untrusted peer {}", peer.ip()),
            why: "X-Forwarded-For/Proto are ignored unless the peer is listed in trusted_proxies, so every client shares one rate-limit key, cookies are not Secure and passkeys are off".to_string(),
            remedy: "set <PREFIX>_TRUSTED_PROXIES to the proxy's IP (e.g. Traefik's) and restart".to_string(),
        });
    }
    next.run(req).await
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
pub async fn csrf_guard(req: Request<Body>, next: Next) -> Response {
    let safe = matches!(*req.method(), Method::GET | Method::HEAD | Method::OPTIONS);
    if !safe
        && let Some(origin) = req
            .headers()
            .get(header::ORIGIN)
            .and_then(|v| v.to_str().ok())
    {
        let host = req
            .headers()
            .get(header::HOST)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let origin_host = origin.split("://").nth(1).unwrap_or(origin);
        if !origin_host.eq_ignore_ascii_case(host) {
            return Error::new(
                Kind::Unauthorized,
                format!("cross-origin request from {origin} refused"),
                "call this endpoint from the dashboard itself, or from a script without an Origin header",
            )
            .into_response()
            .with_status(StatusCode::FORBIDDEN);
        }
    }
    next.run(req).await
}

/// In-flight cap: over the limit → 503 with `Retry-After` (K10).
pub async fn in_flight_guard(State(g): State<Guards>, req: Request<Body>, next: Next) -> Response {
    match g.max_in_flight.clone().try_acquire_owned() {
        Ok(_permit) => next.run(req).await,
        Err(_) => overloaded(g.retry_after, "the service is at its in-flight limit"),
    }
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
    let per = NonZeroU32::new(per_period).ok_or_else(|| {
        Error::config(
            "a rate limit of 0 per period would refuse everything",
            "set it to at least 1",
        )
    })?;
    let burst = NonZeroU32::new(burst).ok_or_else(|| {
        Error::config(
            "a rate-limit burst of 0 would refuse everything",
            "set it to at least 1",
        )
    })?;
    let replenish = period / per.get();
    let quota = Quota::with_period(replenish)
        .ok_or_else(|| Error::config("rate-limit period is zero", "set a positive period"))?
        .allow_burst(burst);
    Ok(Arc::new(RateLimiter::keyed(quota)))
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
    let ip = client_ip(peer, req.headers(), &l.guards.trusted_proxies);
    match l.limiter.check_key(&ip) {
        Ok(()) => next.run(req).await,
        Err(_) => {
            let mut res = overloaded(l.guards.retry_after, "too many attempts from this address");
            *res.status_mut() = StatusCode::TOO_MANY_REQUESTS;
            res
        }
    }
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
mod tests {
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
}
