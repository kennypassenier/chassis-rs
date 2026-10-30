//! `App::run`: a control command, or the full lifecycle (start, wait for
//! SIGTERM or an update restart, stop), with the self-update decisions
//! that must happen before anything opens a store.

use std::process::ExitCode;

use super::App;
use crate::shell::lifecycle;

impl App {
    /// Control command or full lifecycle; errors are printed with their
    /// remedy and turn into exit 1.
    pub(super) async fn run_lifecycle(mut self) -> ExitCode {
        match self.control().await {
            Ok(Some(code)) => return code,
            Ok(None) => {}
            Err(e) => {
                eprintln!("{e}");
                return ExitCode::FAILURE;
            }
        }
        #[cfg(feature = "self-update")]
        let (updater, drill) = match self.decide_pending_update() {
            Ok(decided) => decided,
            Err(code) => return code,
        };
        // Registered before the bind so no SIGTERM can slip in unhandled
        // between "listening" and the first poll of the listener (rule 8a).
        let stop = lifecycle::stop_signals();
        match self.start().await {
            Ok(running) => {
                #[cfg(feature = "self-update")]
                let restart = update_restart(&updater, drill.as_deref());
                #[cfg(feature = "self-update")]
                tokio::select! {
                    _ = stop.wait() => {}
                    _ = restart => {
                        tracing::info!("stopping for the update restart");
                    }
                }
                #[cfg(not(feature = "self-update"))]
                stop.wait().await;
                running.stop().await;
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("{e}");
                ExitCode::FAILURE
            }
        }
    }

    /// AR15: the pending-update decision runs before anything opens a
    /// store (critic #2), and the drill marker breaks only the version it
    /// names (critic #6). `Err(code)` means "exit now with this code".
    #[cfg(feature = "self-update")]
    fn decide_pending_update(
        &self,
    ) -> Result<
        (
            std::sync::Arc<crate::shell::update::Updater>,
            Option<String>,
        ),
        ExitCode,
    > {
        let updater = match self.build_updater(false) {
            Ok(u) => u,
            Err(e) => {
                eprintln!("{e}");
                return Err(ExitCode::FAILURE);
            }
        };
        match updater.handle_pending_update() {
            Ok(true) => {
                eprintln!("update reverted; exiting so the supervisor starts the restored binary");
                return Err(ExitCode::SUCCESS);
            }
            Ok(false) => {}
            Err(e) => {
                eprintln!("{e}");
                return Err(ExitCode::FAILURE);
            }
        }
        let drill = updater.drill_kind();
        if drill.as_deref() == Some("broken") {
            eprintln!("DRILL: this version exits before READY on purpose (update_drill=broken)");
            return Err(ExitCode::FAILURE);
        }
        Ok((updater, drill))
    }
}

/// A future that resolves when the autonomous updater installed a release
/// and wants the restart; pending forever otherwise (a dropped sender
/// would resolve at once and stop the service right after it started — the
/// L5 E2E run caught that). Also starts the probation timer and the
/// `broken-after-ready` drill.
#[cfg(feature = "self-update")]
fn update_restart(
    updater: &std::sync::Arc<crate::shell::update::Updater>,
    drill: Option<&str>,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>> {
    use crate::core::update::Mode;
    use std::time::Duration;
    if drill == Some("broken-after-ready") {
        tracing::warn!(
            "DRILL: exiting 1 five seconds after READY (update_drill=broken-after-ready)"
        );
        tokio::spawn(async {
            tokio::time::sleep(Duration::from_secs(5)).await;
            std::process::exit(1);
        });
    }
    if updater.effective.mode == Mode::Autonomous {
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        let u = updater.clone();
        tokio::spawn(async move {
            tokio::time::sleep(u.cfg.healthy_after).await;
            u.confirm_healthy();
        });
        let u = updater.clone();
        tokio::spawn(async move {
            u.run_autonomous().await;
            let _ = tx.send(());
        });
        Box::pin(async move {
            let _ = rx.await;
        })
    } else {
        Box::pin(std::future::pending())
    }
}
