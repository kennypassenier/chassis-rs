//! The "forwarded headers from an untrusted peer" notice: logs once and
//! records a kit problem. Its own module because it is the only guard that
//! writes to the problems card.

use std::net::SocketAddr;
use std::sync::atomic::Ordering;

use axum::body::Body;
use axum::extract::{ConnectInfo, Request, State};
use axum::middleware::Next;
use axum::response::Response;

use super::{Guards, KitProblem};

/// Body of [`super::untrusted_proxy_guard`].
pub(super) async fn untrusted_proxy_guard(
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
