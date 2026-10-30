//! One release check: compare, hold, install, and the bookkeeping the status
//! card and the failure threshold read. Its own module so the decision
//! "what does this check do" is apart from the download, the install steps
//! and the loops that schedule it.

use super::*;

impl Updater {
    /// Fold one check's result into [`LastCheck`] and return the event the
    /// failure threshold calls for, if any. The lock is held only here.
    pub(super) fn record_check(&self, result: &Result<Outcome, Error>) -> Option<Event> {
        let mut last = self.last.lock().expect("last lock");
        last.at = Some(now_rfc3339());
        let (failures, kind) = failure_transition(
            last.consecutive_failures,
            result.is_ok(),
            self.cfg.notify_after_failures,
        );
        let streak = last.consecutive_failures;
        last.consecutive_failures = failures;
        match result {
            Ok(o) => {
                last.error = None;
                last.outcome = Some(format!("{o:?}"));
                last.latest = match o {
                    Outcome::Current { latest } | Outcome::Held { latest } => {
                        Some(latest.to_string())
                    }
                    Outcome::Installed { to, .. } => Some(to.to_string()),
                    Outcome::Blocked { .. } => last.latest.clone(),
                };
            }
            Err(e) => last.error = Some(e.to_string()),
        }
        kind.map(|kind| Event {
            kind,
            version: self.running.to_string(),
            detail: match result {
                Ok(_) => format!("release checks succeed again after {streak} failures"),
                Err(e) => format!("{failures} consecutive release checks failed; last: {e}"),
            },
        })
    }

    pub(super) async fn check_inner(&self) -> Result<Outcome, Error> {
        if let Some(state) = read_state(&self.state_path()) {
            return Ok(Outcome::Blocked {
                pending: state.to_version,
            });
        }
        if self.drill_path().exists() {
            return Ok(Outcome::Blocked {
                pending: "drill marker present".to_string(),
            });
        }
        let latest = self.latest().await?;
        if !should_update(self.running, latest) {
            return Ok(Outcome::Current { latest });
        }
        // CF-3 (live drill 2026-09-05): a version that was installed and
        // rolled back is never retried by this process; otherwise the loop
        // reinstalls it every interval and the service churns through the
        // same crash. A NEWER release clears the way on its own.
        if self.is_skipped(latest) {
            (self.notify)(Event {
                kind: "update.held",
                version: latest.to_string(),
                detail: "rolled back earlier; skipped until a newer release appears".to_string(),
            });
            return Ok(Outcome::Held { latest });
        }
        if !self.cfg.hold.allows(self.running, latest) {
            (self.notify)(Event {
                kind: "update.held",
                version: latest.to_string(),
                detail: format!("{:?} holds it", self.cfg.hold),
            });
            return Ok(Outcome::Held { latest });
        }
        self.install(latest).await?;
        Ok(Outcome::Installed {
            from: self.running,
            to: latest,
        })
    }

    /// What the status card shows (K17).
    pub fn last_check(&self) -> LastCheck {
        self.last.lock().expect("last lock").clone()
    }

    /// One check: compare, hold, install. Never restarts; the caller
    /// decides what an `Installed` means in its mode.
    pub async fn check_once(&self) -> Result<Outcome, Error> {
        let result = self.check_inner().await;
        let event = self.record_check(&result);
        // Outside the lock: the sink may be a project's hook.
        if let Some(event) = event {
            (self.notify)(event);
        }
        result
    }

    /// One read-only look at the release host (K20): what is the latest
    /// version, is it newer than what runs. Nothing is downloaded or
    /// installed; the status card shows the answer.
    pub async fn watch_once(&self) -> Result<Version, Error> {
        let result = self.latest().await;
        let mut last = self.last.lock().expect("last lock");
        last.at = Some(now_rfc3339());
        match &result {
            Ok(latest) => {
                last.error = None;
                last.latest = Some(latest.to_string());
                last.outcome = Some(if !should_update(self.running, *latest) {
                    "current".to_string()
                } else if self.is_skipped(*latest) {
                    format!(
                        "newer available: {latest}, but it was rolled back earlier and is skipped"
                    )
                } else {
                    format!(
                        "newer available: {latest} (not installed in {} mode)",
                        self.effective.mode.label()
                    )
                });
            }
            Err(e) => last.error = Some(e.to_string()),
        }
        result
    }
}
