//! The dashboard knobs (L3, K9, S6): login, sessions, clients, request
//! captures, the https origin and the passkey ceremony bounds.

use super::{DASHBOARD, PASSKEYS, k, secret};
use crate::core::config::Knob;

pub(super) fn rows() -> Vec<Knob> {
    vec![
        // L3 — login, clients, captures (K8, K12, K13)
        secret(
            "token",
            "The admin token (at least 16 characters): logs in on `/login` and works as a bearer for the operator's own scripts.",
        ),
        secret(
            "secret_key",
            "32 bytes as 64 hex characters, sealing the clients, sessions and passkeys stores on disk.",
        ),
        k(
            "session_ttl_secs",
            Some("86400"),
            DASHBOARD,
            "Seconds a plain login session stays valid after its last use.",
        ),
        k(
            "remember_me_days",
            Some("30"),
            DASHBOARD,
            "Days a \"keep me logged in\" session lasts.",
        ),
        k(
            "capture_keep",
            Some("20"),
            DASHBOARD,
            "Last requests kept in memory per client for the Last requests panel.",
        ),
        k(
            "capture_body_bytes",
            Some("4096"),
            DASHBOARD,
            "Bytes of a captured request body kept before it is cut with a `truncated` mark.",
        ),
        k(
            "capture_ttl_secs",
            Some("3600"),
            DASHBOARD,
            "Seconds a captured request is kept before it disappears.",
        ),
        k(
            "capture_redact",
            Some(""),
            DASHBOARD,
            "Comma-separated header names shown as `***` in captures, on top of `authorization`, `cookie`, `set-cookie` and `x-api-key`.",
        ),
        k(
            "clients_persist_secs",
            Some("30"),
            DASHBOARD,
            "Seconds between writes of the clients' usage counters to disk.",
        ),
        k(
            "reveal_seconds",
            Some("10"),
            DASHBOARD,
            "Seconds the Reveal button shows a token in the browser.",
        ),
        // K9 — the https origin the dashboard is reached at (passkeys)
        k(
            "public_url",
            None,
            PASSKEYS,
            "The `https://` origin the dashboard is reached at; required when passkeys are compiled in.",
        ),
        // S6 — the bounds on pending passkey ceremonies (1.4.0)
        k(
            "passkey_ceremony_cap",
            Some("64"),
            PASSKEYS,
            "Pending passkey ceremonies kept in memory; at the cap the oldest makes room.",
        ),
        k(
            "passkey_ceremony_ttl_secs",
            Some("300"),
            PASSKEYS,
            "Seconds a started passkey ceremony may take before it is swept.",
        ),
        k(
            "passkey_ceremonies_per_ip",
            Some("8"),
            PASSKEYS,
            "Pending passkey ceremonies one client IP may hold at once.",
        ),
    ]
}
