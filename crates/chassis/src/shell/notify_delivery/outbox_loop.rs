//! The delivery loop itself: pick the next due message, deliver it, record
//! the outcome and wait when there is nothing to do. Its own module because
//! it is the only long-running task here; one-shot sending stays in the
//! parent.

use std::time::Duration;

use super::{Down, Reply, deliver};
use crate::shell::notify_channel::Channel;
use crate::shell::time::now_epoch;
use crate::storage::outbox::Waiting;

fn round_delay(ch: &Channel, attempts: i64) -> Duration {
    let cfg = ch.config();
    let doubled = cfg
        .round_base
        .saturating_mul(1u32 << attempts.clamp(0, 16) as u32);
    doubled.min(cfg.round_cap)
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, crate::core::error::Error> + Send + 'static,
) -> Result<T, crate::core::error::Error> {
    tokio::task::spawn_blocking(f).await.unwrap_or_else(|e| {
        Err(crate::core::error::Error::internal(
            format!("a notification task failed: {e}"),
            "report this to the project",
        ))
    })
}

/// The delivery loop; runs for the life of the process.
pub(crate) async fn run(ch: Channel) {
    let client = reqwest::Client::builder()
        .timeout(ch.config().send.timeout)
        .build()
        .expect("reqwest client");
    let mut down = Down::default();
    let mut write_trouble = WriteTrouble::default();
    let mut failures = 0u32;
    loop {
        let now = now_epoch() as i64;
        let msg = match next_message(&ch, now).await {
            Next::Message(m) => m,
            Next::Wait(wait) => {
                idle(&ch, wait).await;
                continue;
            }
        };
        match deliver(&client, &ch, &msg, &mut down).await {
            Ok((via, reply)) => {
                failures = 0;
                if reply == Reply::Duplicate {
                    tracing::info!(kind = %msg.kind, "kyu already had this message (duplicate); counted as delivered");
                }
                let (o, id) = (ch.outbox().clone(), msg.id);
                if let Err(e) = blocking(move || o.delivered(id)).await {
                    tracing::warn!(error = %e, "notify: a delivered message could not be removed; it may be sent again");
                }
                ch.record_delivery(via);
            }
            Err(errors) => {
                failures += 1;
                let delay = round_delay(&ch, msg.attempts);
                let retry_at = now_epoch() as i64 + delay.as_secs() as i64;
                let (o, id) = (ch.outbox().clone(), msg.id);
                let written = blocking(move || o.failed(id, retry_at)).await;
                for (which, sentence) in &errors {
                    ch.record_error(which.as_str(), sentence);
                }
                // The retry time could not be saved: the row is still due,
                // so without a pause the loop would send it again at once.
                if let Err(e) = &written {
                    let (first, exponent) = write_trouble.note();
                    if first {
                        tracing::warn!(error = %e, "notify: the retry time of a failed message could not be saved; pausing before the next try");
                        ch.record_error(
                            "outbox",
                            "The retry time of a failed message could not be saved to disk, so sending pauses and tries again.",
                        );
                    }
                    idle(&ch, round_delay(&ch, exponent)).await;
                    continue;
                }
                write_trouble.cleared();
                // Two failures in a row: the targets are away. Stop asking.
                if failures >= 2 {
                    idle(&ch, delay).await;
                }
            }
        }
    }
}

/// Failed writes of the retry time, in a row. Only the first of a streak is
/// reported; the rest just lengthen the pause.
#[derive(Debug, Default)]
pub(super) struct WriteTrouble {
    streak: u32,
}

impl WriteTrouble {
    /// A write failed. Returns whether to report it (first of the streak)
    /// and the pause exponent, which grows with the streak.
    pub(super) fn note(&mut self) -> (bool, i64) {
        self.streak = self.streak.saturating_add(1);
        (self.streak == 1, i64::from(self.streak))
    }

    pub(super) fn cleared(&mut self) {
        self.streak = 0;
    }
}

async fn idle(ch: &Channel, wait: Duration) {
    tokio::select! {
        _ = ch.woken() => {}
        _ = tokio::time::sleep(wait) => {}
    }
}

/// What the loop does next: send this message, or wait this long.
enum Next {
    Message(Waiting),
    Wait(Duration),
}

/// Look at the outbox: the oldest due message when there is one and a
/// target to send it to, else how long to wait.
async fn next_message(ch: &Channel, now: i64) -> Next {
    // Rows with no target are skipped inside the query, so they cannot
    // hold up the deliverable rows behind them (they stay queued).
    let due = {
        let (o, c) = (ch.outbox().clone(), ch.clone());
        blocking(move || o.next_due(now, |kind| c.active_for(kind))).await
    };
    match due {
        Ok(Some(m)) => Next::Message(m),
        Ok(None) => {
            // Rows with nowhere to go have no retry to wait for; saving an
            // address wakes the loop.
            let (o, c) = (ch.outbox().clone(), ch.clone());
            let next = blocking(move || o.earliest_retry(|kind| c.active_for(kind)))
                .await
                .ok()
                .flatten();
            Next::Wait(
                next.map(|t| Duration::from_secs((t - now).max(1) as u64))
                    .unwrap_or(Duration::from_secs(3600))
                    .min(Duration::from_secs(3600)),
            )
        }
        Err(e) => {
            tracing::warn!(error = %e, "notify: the outbox could not be read");
            Next::Wait(Duration::from_secs(30))
        }
    }
}
