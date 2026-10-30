//! Sending what the outbox holds (3.15.0, `docs/NOTIFY_DESIGN.md`).
//!
//! One loop takes the oldest due message and offers it to the targets in
//! order: the primary with its retries, then, only if the primary did not
//! take it, the fallback with its retries. That is the whole of "falls back
//! once": the fallback is asked once per round, and a message it accepts is
//! finished and never sent to the primary again. When neither takes it the
//! message stays on disk with a later retry time and the last error is
//! recorded.
//!
//! kyu damping: a message may carry a dedup key and window, sent as
//! `Kyu-Dedup-Key` / `Kyu-Dedup-Window`. A repeat inside the window answers
//! `200` with `Kyu-Duplicate: true`; that is a delivery, not a failure.

use std::time::Duration;

use crate::core::notify::Event;
use crate::shell::notify::redacted_url;
use crate::shell::notify_channel::{Channel, Which};
use crate::shell::time::now_epoch;
use crate::storage::outbox::Waiting;

/// What one target answered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Reply {
    Accepted,
    /// kyu already had this key inside the window; nothing was stored.
    Duplicate,
}

/// Extra request headers for the damping contract.
fn dedup_headers(key: Option<&str>, window: Option<&str>) -> Vec<(&'static str, String)> {
    let mut h = Vec::new();
    if let Some(k) = key {
        h.push(("Kyu-Dedup-Key", k.to_string()));
        if let Some(w) = window {
            h.push(("Kyu-Dedup-Window", w.to_string()));
        }
    }
    h
}

/// One request. The error is a sentence without the address in it.
pub(crate) async fn send_once(
    client: &reqwest::Client,
    url: &str,
    body: &str,
    dedup: (Option<&str>, Option<&str>),
) -> Result<Reply, String> {
    let mut req = client
        .post(url)
        .header("content-type", "application/json")
        .body(body.to_string());
    for (k, v) in dedup_headers(dedup.0, dedup.1) {
        req = req.header(k, v);
    }
    let res = req.send().await.map_err(|e| {
        if e.is_timeout() {
            "it did not answer in time".to_string()
        } else if e.is_connect() {
            "the connection failed".to_string()
        } else {
            format!("the request failed: {}", e.without_url())
        }
    })?;
    let status = res.status();
    if !status.is_success() {
        return Err(format!("it answered HTTP {}", status.as_u16()));
    }
    let duplicate = res
        .headers()
        .get("kyu-duplicate")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.eq_ignore_ascii_case("true"));
    Ok(if duplicate {
        Reply::Duplicate
    } else {
        Reply::Accepted
    })
}

async fn send_with_retries(
    client: &reqwest::Client,
    ch: &Channel,
    url: &str,
    body: &str,
    dedup: (Option<&str>, Option<&str>),
    retries: u32,
) -> Result<Reply, String> {
    use backon::{ExponentialBuilder, Retryable};
    let cfg = &ch.config().send;
    let backoff = ExponentialBuilder::default()
        .with_min_delay(cfg.backoff_base)
        .with_max_delay(cfg.backoff_cap)
        .with_max_times(retries as usize)
        .with_jitter();
    (|| send_once(client, url, body, dedup))
        .retry(backoff)
        .await
}

/// Offer one message to the targets in order. `Ok` names who took it;
/// `Err` has one sentence per target that was asked.
pub(crate) async fn deliver(
    client: &reqwest::Client,
    ch: &Channel,
    msg: &Waiting,
    primary_down: &mut bool,
) -> Result<(Which, Reply), Vec<String>> {
    let dedup = (msg.dedup_key.as_deref(), msg.dedup_window.as_deref());
    let mut errors = Vec::new();
    for (which, url) in ch.targets() {
        // A primary that just failed a message gets one try for the next,
        // not a full ladder, so a dead hub does not stall the fallback.
        let retries = if which == Which::Primary && *primary_down {
            0
        } else {
            ch.config().send.retries
        };
        match send_with_retries(client, ch, &url, &msg.body, dedup, retries).await {
            Ok(reply) => {
                if which == Which::Primary {
                    *primary_down = false;
                } else {
                    tracing::warn!(url = %redacted_url(&url), "delivered via the fallback target");
                }
                return Ok((which, reply));
            }
            Err(why) => {
                if which == Which::Primary {
                    *primary_down = true;
                }
                tracing::warn!(url = %redacted_url(&url), error = %why, target = which.as_str(), "notification target did not take the message");
                errors.push(format!(
                    "The {} target did not take it: {why}.",
                    which.as_str()
                ));
            }
        }
    }
    Err(errors)
}

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
        let due = {
            let o = ch.outbox().clone();
            blocking(move || o.next_due(now)).await
        };
        let msg = match due {
            Ok(Some(m)) if ch.active() => m,
            Ok(Some(_)) => {
                // Messages wait, nothing to send them to.
                idle(&ch, Duration::from_secs(60)).await;
                continue;
            }
            Ok(None) => {
                let o = ch.outbox().clone();
                let next = blocking(move || o.earliest_retry()).await.ok().flatten();
                let wait = next
                    .map(|t| Duration::from_secs((t - now).max(1) as u64))
                    .unwrap_or(Duration::from_secs(3600))
                    .min(Duration::from_secs(3600));
                idle(&ch, wait).await;
                continue;
            }
            Err(e) => {
                tracing::warn!(error = %e, "notify: the outbox could not be read");
                idle(&ch, Duration::from_secs(30)).await;
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

/// The Test button: one marked message to each target that is set, one
/// attempt each, nothing written to the outbox.
pub(crate) async fn send_test(ch: &Channel, service: &str, version: &str) -> serde_json::Value {
    let event = Event {
        service: service.to_string(),
        kind: "notify.test".to_string(),
        at: crate::shell::time::now_rfc3339(),
        version: version.to_string(),
        detail: "TEST: sent from the Notifications card on the Status page. Nothing is wrong."
            .to_string(),
    };
    let body = serde_json::to_string(&event).expect("event serialises");
    let client = reqwest::Client::builder()
        .timeout(ch.config().send.timeout)
        .build()
        .expect("reqwest client");
    let mut results = Vec::new();
    for which in Which::BOTH {
        let Some(url) = ch.target(which).value else {
            results.push(serde_json::json!({"target": which.as_str(), "outcome": "not_set", "detail": "No address is set for it."}));
            continue;
        };
        let (outcome, detail) = match send_once(&client, &url, &body, (None, None)).await {
            Ok(_) => (
                "delivered",
                "The target accepted the test message.".to_string(),
            ),
            Err(why) => ("failed", format!("The target did not take it: {why}.")),
        };
        results.push(
            serde_json::json!({"target": which.as_str(), "outcome": outcome, "detail": detail}),
        );
    }
    serde_json::json!({ "kind": "notify.test", "results": results })
}
