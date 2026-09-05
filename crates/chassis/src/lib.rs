//! chassis — the shared foundation for Kenny's Rust web services.
//!
//! A service built on chassis gets configuration, logging, errors with a
//! remedy, health and metrics endpoints and a graceful shutdown from the
//! `core` feature; a dashboard with login, clients and their tokens from
//! `dashboard`; passkey login from `passkeys`; a signed self-update from
//! `self-update`; and per-event webhooks from `notify`. The service adds
//! only what it does itself.
//!
//! Start with [`AppSpec`] and [`App`]: describe the service, hand over an
//! axum `Router`, register the hooks you need, call `run`. Everything
//! else is reachable from there. The crate is split into [`core`] (pure
//! decisions, no I/O) and [`shell`] (everything that touches the world);
//! a service normally needs neither directly.

#![forbid(unsafe_code)]

pub mod app;
#[cfg(feature = "dashboard")]
pub mod app_dashboard;
pub mod core;
pub mod shell;

pub use app::{App, AppSpec, Control, Running};
pub use core::error::{Error, IntoKitError, Kind};
#[cfg(feature = "dashboard")]
pub use shell::auth::Caller;
pub use shell::health::{Subsystem, SubsystemStatus};
pub use shell::metrics::ScrapeSource;

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
