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
    /// K24 / C4: the one-file example stays readable — at most forty
    /// lines including its doc comment.
    #[test]
    fn minimal_example_fits_in_forty_lines() {
        let src = include_str!("../examples/minimal.rs");
        let lines = src.lines().count();
        assert!(
            lines <= 40,
            "examples/minimal.rs has {lines} lines; the budget is 40"
        );
        assert!(
            src.starts_with("//!"),
            "the example opens with a plain-language doc comment"
        );
    }

    /// K24: every module opens with a plain-language doc comment (`//!`)
    /// before any code, so rustdoc reads as prose first.
    #[test]
    fn every_module_opens_with_a_doc_comment() {
        let modules: &[(&str, &str)] = &[
            ("app.rs", include_str!("app.rs")),
            ("app_dashboard.rs", include_str!("app_dashboard.rs")),
            ("core/mod.rs", include_str!("core/mod.rs")),
            ("core/config.rs", include_str!("core/config.rs")),
            ("core/error.rs", include_str!("core/error.rs")),
            ("core/crypto.rs", include_str!("core/crypto.rs")),
            ("core/clients.rs", include_str!("core/clients.rs")),
            ("core/session.rs", include_str!("core/session.rs")),
            ("core/update.rs", include_str!("core/update.rs")),
            ("core/notify.rs", include_str!("core/notify.rs")),
            ("shell/mod.rs", include_str!("shell/mod.rs")),
            ("shell/config_load.rs", include_str!("shell/config_load.rs")),
            ("shell/logging.rs", include_str!("shell/logging.rs")),
            ("shell/lifecycle.rs", include_str!("shell/lifecycle.rs")),
            ("shell/http.rs", include_str!("shell/http.rs")),
            ("shell/health.rs", include_str!("shell/health.rs")),
            ("shell/metrics.rs", include_str!("shell/metrics.rs")),
            ("shell/guards.rs", include_str!("shell/guards.rs")),
            ("shell/store.rs", include_str!("shell/store.rs")),
            ("shell/time.rs", include_str!("shell/time.rs")),
            ("shell/auth.rs", include_str!("shell/auth.rs")),
            ("shell/captures.rs", include_str!("shell/captures.rs")),
            ("shell/clients_api.rs", include_str!("shell/clients_api.rs")),
            ("shell/assets.rs", include_str!("shell/assets.rs")),
            ("shell/dashboard.rs", include_str!("shell/dashboard.rs")),
            ("shell/passkeys.rs", include_str!("shell/passkeys.rs")),
            ("shell/update.rs", include_str!("shell/update.rs")),
            ("shell/notify.rs", include_str!("shell/notify.rs")),
        ];
        for (name, src) in modules {
            let first = src.lines().next().unwrap_or("");
            assert!(
                first.starts_with("//! "),
                "{name} does not open with a `//!` doc comment"
            );
            let words = first.trim_start_matches("//!").split_whitespace().count();
            assert!(
                words >= 3,
                "{name}'s first doc line is not a sentence: {first}"
            );
        }
    }

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
