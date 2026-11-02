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
#[cfg(test)]
mod tests;

pub(crate) use outbox_loop::run;

use crate::core::notify::Event;
use crate::core::notify_token::refusal_sentence;
use crate::shell::notify::redacted_url;
use crate::shell::notify_channel::{Channel, Credential, Which};
use crate::storage::outbox::Waiting;

/// What one target answered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Reply {
    Accepted,
    /// kyu already had this key inside the window; nothing was stored.
    Duplicate,
}

/// Which targets just failed a message. A target that failed gets one try
/// for the next message, not a full ladder, so a dead target does not stall
/// the others; each target is remembered on its own, so a dead kit target
/// does not take the retries away from a healthy primary.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct Down([bool; 3]);

impl Down {
    fn slot(which: Which) -> usize {
        match which {
            Which::Primary => 0,
            Which::Kit => 1,
            Which::Fallback => 2,
        }
    }

    pub(crate) fn is_down(&self, which: Which) -> bool {
        self.0[Self::slot(which)]
    }

    pub(crate) fn set(&mut self, which: Which, down: bool) {
        self.0[Self::slot(which)] = down;
    }

    /// The retries for `which` on the next message.
    fn retries(&self, which: Which, configured: u32) -> u32 {
        if self.is_down(which) { 0 } else { configured }
    }
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

/// One request. `auth` is `Some` only for the primary target: its token
/// (when set) goes out as a bearer header and a 401/403 gets the sentence
/// that names the token. The error is a sentence with neither the address
/// nor the token in it.
pub(crate) async fn send_once(
    client: &reqwest::Client,
    url: &str,
    body: &str,
    dedup: (Option<&str>, Option<&str>),
    auth: Option<&Credential>,
) -> Result<Reply, String> {
    let mut req = client
        .post(url)
        .header("content-type", "application/json")
        .body(body.to_string());
    for (k, v) in dedup_headers(dedup.0, dedup.1) {
        req = req.header(k, v);
    }
    if let Some(token) = auth.and_then(|a| a.token.as_ref()) {
        let mut value = reqwest::header::HeaderValue::from_str(&token.bearer())
            .map_err(|_| "the token cannot be sent as a header".to_string())?;
        // Keep the secret out of any debug print of the request.
        value.set_sensitive(true);
        req = req.header(reqwest::header::AUTHORIZATION, value);
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
        let code = status.as_u16();
        return Err(match auth {
            Some(a) if code == 401 || code == 403 => {
                refusal_sentence(code, a.token.is_some(), &a.env_name)
            }
            _ => format!("it answered HTTP {code}"),
        });
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
    auth: Option<&Credential>,
) -> Result<Reply, String> {
    use backon::{ExponentialBuilder, Retryable};
    let cfg = &ch.config().send;
    let backoff = ExponentialBuilder::default()
        .with_min_delay(cfg.backoff_base)
        .with_max_delay(cfg.backoff_cap)
        .with_max_times(retries as usize)
        .with_jitter();
    (|| send_once(client, url, body, dedup, auth))
        .retry(backoff)
        .await
}

/// Offer one message to the targets in order. `Ok` names who took it;
/// `Err` has one sentence per target that was asked, with that target.
pub(crate) async fn deliver(
    client: &reqwest::Client,
    ch: &Channel,
    msg: &Waiting,
    down: &mut Down,
) -> Result<(Which, Reply), Vec<(Which, String)>> {
    let dedup = (msg.dedup_key.as_deref(), msg.dedup_window.as_deref());
    let mut errors = Vec::new();
    for (which, url) in ch.targets_for(&msg.kind) {
        let retries = down.retries(which, ch.config().send.retries);
        let auth = which.is_hub().then(|| ch.primary_credential());
        match send_with_retries(client, ch, &url, &msg.body, dedup, retries, auth).await {
            Ok(reply) => {
                down.set(which, false);
                if !which.is_hub() {
                    tracing::warn!(url = %redacted_url(&url), "delivered via the fallback target");
                }
                return Ok((which, reply));
            }
            Err(why) => {
                down.set(which, true);
                tracing::warn!(url = %redacted_url(&url), error = %why, target = which.as_str(), "notification target did not take the message");
                errors.push((
                    which,
                    format!("The {} target did not take it: {why}.", which.as_str()),
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
    let asked = Which::BOTH
        .into_iter()
        .chain(ch.kit_target().map(|_| Which::Kit));
    for which in asked {
        let Some(url) = ch.target(which).value else {
            results.push(serde_json::json!({"target": which.as_str(), "outcome": "not_set", "detail": "No address is set for it."}));
            continue;
        };
        let auth = which.is_hub().then(|| ch.primary_credential());
        let (outcome, detail) = match send_once(&client, &url, &body, (None, None), auth).await {
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
