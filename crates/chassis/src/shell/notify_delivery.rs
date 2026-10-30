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

mod outbox_loop;

pub(crate) use outbox_loop::run;

use crate::core::notify::Event;
use crate::shell::notify::redacted_url;
use crate::shell::notify_channel::{Channel, Which};
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
