//! The per-IP login limit and the per-client-token API limit: their
//! constructors and the rate-limit middleware body. Its own module because
//! rate limiting is independent of how credentials are checked.

use axum::body::Body;
use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::{Caller, TokenLimit};
use crate::core::error::{Error, Kind};
use crate::shell::guards::{Guards, IpLimit};

/// Body of [`super::login_limit`].
pub(super) fn login_limit(guards: Guards, per_min: u32, burst: u32) -> Result<IpLimit, Error> {
    let limiter =
        crate::shell::guards::keyed_limiter(per_min, std::time::Duration::from_secs(60), burst)?;
    crate::shell::guards::spawn_limiter_pruner(limiter.clone(), std::time::Duration::from_secs(60));
    Ok(IpLimit { limiter, guards })
}

/// Body of [`super::token_limit`].
pub(super) fn token_limit(guards: Guards, per_sec: u32, burst: u32) -> Result<TokenLimit, Error> {
    let limiter =
        crate::shell::guards::keyed_limiter(per_sec, std::time::Duration::from_secs(1), burst)?;
    crate::shell::guards::spawn_limiter_pruner(limiter.clone(), std::time::Duration::from_secs(60));
    Ok(TokenLimit { limiter, guards })
}

/// Body of [`super::token_rate_limit`].
pub(super) async fn token_rate_limit(
    State(l): State<TokenLimit>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let key = match req.extensions().get::<Caller>() {
        Some(Caller::Client { id, .. }) => id.clone(),
        _ => return next.run(req).await,
    };
    match l.limiter.check_key(&key) {
        Ok(()) => next.run(req).await,
        Err(_) => {
            let mut res = Error::new(
                Kind::Overloaded,
                "this client token is over its rate limit",
                "slow down: the limit is rate_limit_token_per_sec with a burst of rate_limit_token_burst; Retry-After says when",
            )
            .into_response();
            *res.status_mut() = axum::http::StatusCode::TOO_MANY_REQUESTS;
            res.headers_mut().insert(
                axum::http::header::RETRY_AFTER,
                axum::http::HeaderValue::from_str(&l.guards.retry_after.as_secs().to_string())
                    .expect("digits"),
            );
            res
        }
    }
}
