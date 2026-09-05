//! Startup readiness and graceful shutdown (K5, W9, AR15).
//!
//! Readiness: once the socket is bound and the stores are open, the kit
//! tells systemd `READY=1` when a `NOTIFY_SOCKET` is present, so a
//! `Type=notify` unit reaches `active` only when the service can answer.
//! Without the socket the call is silently a no-op, which is what a
//! terminal run or a container wants.
//!
//! Shutdown (norm N1): SIGTERM or Ctrl-C stops the listener, lets
//! in-flight requests finish, runs the project's flush hook, and exits 0
//! — bounded by the shutdown timeout. Exceeding the bound logs one loud
//! line naming what was still open and exits 0 anyway: hanging on
//! shutdown is worse than stopping early, and a non-zero code would make
//! systemd report a clean stop as a crash. A second signal changes
//! nothing: the first one already started the only shutdown there is.

use std::future::Future;
use std::time::Duration;

use tokio::signal::unix::{SignalKind, signal};

/// Tell systemd we are ready, if it is listening.
pub fn notify_ready() {
    match sd_notify::notify(&[sd_notify::NotifyState::Ready]) {
        Ok(()) => tracing::debug!("sd_notify READY=1 sent (or no NOTIFY_SOCKET)"),
        Err(e) => {
            tracing::warn!(error = %e, "sd_notify READY=1 failed; systemd may keep the unit in 'activating'")
        }
    }
}

/// Resolves when SIGTERM or SIGINT arrives. Used as axum's graceful
/// shutdown signal. Further signals are ignored on purpose (N1: a second
/// SIGTERM changes nothing).
pub async fn wait_for_stop_signal() {
    let mut term = match signal(SignalKind::terminate()) {
        Ok(s) => s,
        Err(e) => {
            tracing::error!(error = %e, "cannot listen for SIGTERM; only Ctrl-C will stop the service");
            let _ = tokio::signal::ctrl_c().await;
            return;
        }
    };
    tokio::select! {
        _ = term.recv() => tracing::info!("SIGTERM received; finishing in-flight requests"),
        _ = tokio::signal::ctrl_c() => tracing::info!("Ctrl-C received; finishing in-flight requests"),
    }
}

/// Run `work` (the server drain plus the flush hook) under the shutdown
/// bound. Returns whether it finished in time; the caller exits 0 either
/// way.
pub async fn bounded<F>(timeout: Duration, what: &str, work: F) -> bool
where
    F: Future<Output = ()>,
{
    match tokio::time::timeout(timeout, work).await {
        Ok(()) => true,
        Err(_) => {
            tracing::error!(
                timeout_ms = timeout.as_millis() as u64,
                still_open = what,
                "shutdown exceeded its bound; exiting 0 anyway (norm N1)"
            );
            false
        }
    }
}

/// Parse the shutdown timeout knob: a positive number of milliseconds.
/// Zero is refused (kyu's rule): a zero bound would make every shutdown
/// "exceed" it and log the loud line on a clean stop.
pub fn parse_shutdown_timeout(raw: &str) -> Result<Duration, crate::core::error::Error> {
    let ms: u64 = raw.trim().parse().map_err(|_| {
        crate::core::error::Error::config(
            format!("shutdown_timeout_ms `{raw}` is not a whole number of milliseconds"),
            "set it to a positive integer, e.g. 10000",
        )
    })?;
    if ms == 0 {
        return Err(crate::core::error::Error::config(
            "shutdown_timeout_ms is 0",
            "set it to a positive number; 0 would make every clean stop look like a timeout",
        ));
    }
    Ok(Duration::from_millis(ms))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shutdown_timeout_refuses_zero_and_garbage() {
        assert_eq!(
            parse_shutdown_timeout("250").unwrap(),
            Duration::from_millis(250)
        );
        assert!(parse_shutdown_timeout("0").is_err());
        assert!(parse_shutdown_timeout("ten").is_err());
    }

    #[tokio::test]
    async fn bounded_reports_timeout_without_panicking() {
        let finished = bounded(Duration::from_millis(20), "a stuck task", async {
            tokio::time::sleep(Duration::from_millis(200)).await;
        })
        .await;
        assert!(!finished);
        let finished = bounded(Duration::from_millis(200), "nothing", async {}).await;
        assert!(finished);
    }
}
