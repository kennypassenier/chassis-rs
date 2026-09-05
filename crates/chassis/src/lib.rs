//! chassis — the shared foundation for Kenny's Rust web services.
//!
//! A service built on chassis gets configuration, logging, errors with a
//! remedy, health and metrics endpoints and a graceful shutdown from the
//! `core` feature; a dashboard with login, clients and their tokens from
//! `dashboard`; passkey login from `passkeys`; a signed self-update from
//! `self-update`; and per-event webhooks from `notify`. The service adds
//! only what it does itself.
//!
//! L0 (walking skeleton): the crate compiles, declares its features and
//! carries one test, so the gates and CI have something to run against.
//! Every module arrives with its milestone (docs/REALIZATION_PLAN.md).

#![forbid(unsafe_code)]

/// The kit's own version, as compiled in. A service reports its OWN
/// version in `/healthz` (K6); this one is for `--print-config` and the
/// status page's "built on chassis x.y.z" line.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    #[test]
    fn version_is_semver_shaped() {
        // L0 smoke test: three dot-separated numeric parts. The full
        // semver comparison arrives with the self-update module (K18).
        let parts: Vec<&str> = super::VERSION.split('.').collect();
        assert_eq!(parts.len(), 3, "CARGO_PKG_VERSION is not x.y.z");
        for part in parts {
            assert!(part.parse::<u64>().is_ok(), "non-numeric part {part}");
        }
    }
}
