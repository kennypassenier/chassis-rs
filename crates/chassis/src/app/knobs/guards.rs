//! The guard, health and metrics knobs (L2): body and rate limits, timeouts,
//! trusted proxies. Its own file so each knob family stays a short,
//! reviewable table.

use super::k;
use crate::core::config::Knob;

pub(super) fn rows() -> Vec<Knob> {
    vec![
        // L2 — guards, health, metrics (K6, K7, K10)
        k(
            "max_body_bytes",
            Some("1048576"),
            None,
            "Request bodies above this many bytes are answered 413.",
        ),
        k(
            "max_in_flight",
            Some("64"),
            None,
            "Concurrent requests above this number are answered 503 with a `Retry-After` header.",
        ),
        k(
            "retry_after_secs",
            Some("5"),
            None,
            "The `Retry-After` value, in seconds, on 429 and 503 answers.",
        ),
        k(
            "request_timeout_secs",
            Some("30"),
            None,
            "Requests taking longer than this many seconds are answered 408, except on paths the service exempts.",
        ),
        k(
            "rate_limit_login_per_min",
            Some("10"),
            None,
            "Login attempts allowed per client IP per minute.",
        ),
        k(
            "rate_limit_login_burst",
            Some("5"),
            None,
            "Login attempts one client IP may make in a burst before the per-minute rate applies.",
        ),
        k(
            "rate_limit_token_per_sec",
            Some("50"),
            None,
            "API requests allowed per client token per second; the admin token is not limited.",
        ),
        k(
            "rate_limit_token_burst",
            Some("100"),
            None,
            "API requests one client token may make in a burst before the per-second rate applies.",
        ),
        k(
            "subsystem_check_timeout_ms",
            Some("2000"),
            None,
            "A `/healthz` subsystem check longer than this many milliseconds counts as failing.",
        ),
        k(
            "healthcheck_timeout_secs",
            Some("5"),
            None,
            "Seconds the `--healthcheck` probe waits for `/healthz`.",
        ),
        k(
            "trusted_proxies",
            Some(""),
            None,
            "Comma-separated IP addresses whose `X-Forwarded-For` and `X-Forwarded-Proto` headers are believed.",
        ),
        k(
            "trusted_admins",
            Some(""),
            None,
            "Comma-separated IP addresses whose requests are the admin without a login: the TCP peer, or behind a trusted proxy the last X-Forwarded-For hop that proxy appended; never a trusted proxy itself. Needs the dashboard feature.",
        ),
    ]
}
