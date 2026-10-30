//! Hooks and deadline of the controller: running the project's pause and
//! resume hooks off the async threads and arming the timer that ends a pause
//! nobody resumed. Its own module so the pause sequencing in the parent reads
//! without the plumbing.

use super::*;

impl Controller {
    pub(super) async fn run_pause_hooks(&self, mode: Mode) -> Result<(), String> {
        for hook in self.pause_hooks.iter() {
            let hook = hook.clone();
            tokio::task::spawn_blocking(move || hook(mode))
                .await
                .unwrap_or_else(|e| {
                    Err(Error::internal(
                        format!("the backup pause hook panicked: {e}"),
                        "report this to the project",
                    ))
                })
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub(super) async fn run_resume_hooks(&self) {
        for hook in self.resume_hooks.iter() {
            let hook = hook.clone();
            let _ = tokio::task::spawn_blocking(move || hook()).await;
        }
    }

    /// One timer per call; each re-reads the deadline, and only ends the
    /// pause it was armed for.
    pub(super) fn arm_deadline(&self, epoch: u64) {
        let me = self.clone();
        tokio::spawn(async move {
            loop {
                let until = {
                    let s = state();
                    if !s.paused || s.epoch != epoch {
                        return;
                    }
                    s.until
                };
                let Some(until) = until else { return };
                if Instant::now() >= until {
                    let ended = {
                        let s = state();
                        s.paused && s.epoch == epoch
                    };
                    if ended {
                        me.resume("deadline").await;
                    }
                    return;
                }
                tokio::time::sleep_until(until.into()).await;
            }
        });
    }
}

pub(super) fn unix_secs(at: Instant) -> u64 {
    let ahead = at.saturating_duration_since(Instant::now());
    (SystemTime::now() + ahead)
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}
