//! The service side of the backup pause: [`Controller`] pauses, extends and
//! resumes the process-wide gate and runs the project's hooks. Its own module
//! so the gate and its tickets (the parent) stay small and the pause
//! sequencing reads on its own. The public methods are declared in the parent
//! (the API record keys on the declaring module) and delegate here.

mod hooks;

use super::*;
use hooks::unix_secs;

/// How a pause call found the gate.
enum Start {
    New(u64),
    Extend {
        epoch: u64,
        later: Instant,
        raise: bool,
    },
}

impl Controller {
    /// The work behind [`Controller::pause`].
    pub(super) async fn begin_pause(
        &self,
        length: Duration,
        asked: Mode,
    ) -> Result<(u64, Mode), PauseError> {
        if length.is_zero() || length > MAX_PAUSE {
            return Err(PauseError::Invalid(format!(
                "a pause lasts 1 to {} seconds, not {}",
                MAX_PAUSE.as_secs(),
                length.as_secs()
            )));
        }
        let mode = asked.max(self.floor);
        let until = Instant::now() + length;
        let epoch = match self.begin_or_extend(mode, until) {
            Start::New(epoch) => epoch,
            Start::Extend {
                epoch,
                later,
                raise,
            } => return self.extend(epoch, later, raise).await,
        };
        self.drain_writers(epoch).await?;
        if let Err(e) = self.run_pause_hooks(mode).await {
            self.abort(epoch);
            self.run_resume_hooks().await;
            tracing::warn!("backup pause refused: a pause hook failed: {e}");
            return Err(PauseError::Hook(e));
        }
        self.arm_deadline(epoch);
        tracing::info!(
            seconds = length.as_secs(),
            until = unix_secs(until),
            mode = mode.as_str(),
            "backup pause: holding"
        );
        Ok((unix_secs(until), mode))
    }

    /// Flip the gate: start a new pause, or move the deadline and mode of
    /// the one in force. The state lock is held only for this decision.
    fn begin_or_extend(&self, mode: Mode, until: Instant) -> Start {
        let mut s = state();
        if s.paused {
            let later = s.until.map_or(until, |u| u.max(until));
            s.until = Some(later);
            let raise = mode == Mode::Full && !s.full;
            s.full |= raise;
            Start::Extend {
                epoch: s.epoch,
                later,
                raise,
            }
        } else {
            s.paused = true;
            s.full = mode == Mode::Full;
            s.until = Some(until);
            s.since = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |d| d.as_secs());
            s.epoch += 1;
            self.started
                .store(s.epoch, std::sync::atomic::Ordering::SeqCst);
            Start::New(s.epoch)
        }
    }

    /// A pause while one is in force: keep the later deadline, and raise
    /// to full when asked.
    async fn extend(
        &self,
        epoch: u64,
        later: Instant,
        raise: bool,
    ) -> Result<(u64, Mode), PauseError> {
        // Writes are already held; a raise to full only needs the
        // hooks to stop the background work too.
        if raise && let Err(e) = self.run_pause_hooks(Mode::Full).await {
            state().full = false;
            tracing::warn!("backup pause not raised to full: a pause hook failed: {e}");
            return Err(PauseError::Hook(e));
        }
        self.arm_deadline(epoch);
        let in_force = if state().full {
            Mode::Full
        } else {
            Mode::Writes
        };
        tracing::info!(
            until = unix_secs(later),
            mode = in_force.as_str(),
            "backup pause extended"
        );
        Ok((unix_secs(later), in_force))
    }

    /// Wait for the writes in flight to come back; when they do not
    /// within the drain time, undo the pause and refuse it.
    async fn drain_writers(&self, epoch: u64) -> Result<(), PauseError> {
        let drained = tokio::time::timeout(self.drain, async {
            loop {
                let notified = NOTIFY.notified();
                if state().writers == 0 {
                    return;
                }
                let _ = tokio::time::timeout(Duration::from_millis(50), notified).await;
            }
        })
        .await;
        if drained.is_err() {
            let busy = self.abort(epoch);
            tracing::warn!(
                writers = busy,
                "backup pause refused: writes still in flight after {} s",
                self.drain.as_secs()
            );
            return Err(PauseError::Busy(busy));
        }
        Ok(())
    }

    /// The work behind [`Controller::resume`].
    pub(super) async fn end_pause(&self, reason: &str) -> bool {
        let was = {
            let mut s = state();
            let was = s.paused;
            s.paused = false;
            s.full = false;
            s.until = None;
            was
        };
        wake_all();
        if was {
            self.run_resume_hooks().await;
            tracing::info!(reason, "backup pause ended");
        }
        was
    }

    /// The work behind [`Controller::resume_own`].
    pub(super) async fn end_own_pause(&self, reason: &str) -> bool {
        let own = {
            let s = state();
            s.paused && s.epoch == self.started.load(std::sync::atomic::Ordering::SeqCst)
        };
        own && self.end_pause(reason).await
    }

    fn abort(&self, epoch: u64) -> usize {
        let mut s = state();
        let busy = s.writers;
        if s.epoch == epoch {
            s.paused = false;
            s.full = false;
            s.until = None;
        }
        drop(s);
        wake_all();
        busy
    }
}
