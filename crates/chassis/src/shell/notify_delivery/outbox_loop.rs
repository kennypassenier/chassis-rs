//! The delivery loop itself: pick the next due message, deliver it, record
//! the outcome and wait when there is nothing to do. Its own module because
//! it is the only long-running task here; one-shot sending stays in the
//! parent.

use std::time::Duration;

use super::{Reply, deliver};
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
    let mut primary_down = false;
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
        match deliver(&client, &ch, &msg, &mut primary_down).await {
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
                let _ = blocking(move || o.failed(id, retry_at)).await;
                ch.record_error("primary", &errors.join(" "));
                // Two failures in a row: the targets are away. Stop asking.
                if failures >= 2 {
                    idle(&ch, delay).await;
                }
            }
        }
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
    let due = {
        let o = ch.outbox().clone();
        blocking(move || o.next_due(now)).await
    };
    match due {
        Ok(Some(m)) if ch.active() => Next::Message(m),
        // Messages wait, nothing to send them to.
        Ok(Some(_)) => Next::Wait(Duration::from_secs(60)),
        Ok(None) => {
            let o = ch.outbox().clone();
            let next = blocking(move || o.earliest_retry()).await.ok().flatten();
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
