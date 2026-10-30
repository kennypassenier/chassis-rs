//! The keyed GCRA limiter constructor and the per-IP rate-limit middleware
//! body. Its own module because rate limiting is independent of the
//! in-flight and timeout caps in the parent.

use std::net::SocketAddr;
use std::num::NonZeroU32;
use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;
use governor::{Quota, RateLimiter};

use super::{IpLimit, KeyedLimiter, client_ip, overloaded};
use crate::core::error::Error;

/// Body of [`super::keyed_limiter`].
pub(super) fn keyed_limiter<K: std::hash::Hash + Eq + Clone>(
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

/// Body of [`super::ip_rate_limit`].
pub(super) async fn ip_rate_limit(
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
