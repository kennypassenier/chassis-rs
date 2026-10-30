//! Delivering notifications (K22, AR10): a bounded queue drained by one
//! task; each event fans out to the webhooks that want it; each webhook
//! gets a bounded number of retries with backoff and then its fallback.
//! Delivery is best effort and never blocks the caller: the event is
//! also logged, so a lost webhook is a lost convenience, not lost
//! evidence.
//!
//! `health.degraded` is debounced (critic #20): the health sampler emits
//! it once per degradation, and `health.recovered` once when it clears.

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;

use crate::core::notify::{Event, Webhook};
use crate::shell::time::now_rfc3339;

/// Knobs (AR3).
#[derive(Debug, Clone)]
pub struct NotifyConfig {
    pub timeout: Duration,
    pub retries: u32,
    pub backoff_base: Duration,
    pub backoff_cap: Duration,
    pub queue_size: usize,
}

/// The drain task's future, spawned once a runtime exists.
pub type Drain = std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>>;

/// The handle a service and the kit send events through.
#[derive(Clone)]
pub struct Notifier {
    service: String,
    tx: Option<mpsc::Sender<Event>>,
    /// Webhooks that claim an event keep it (3.15.0): the channel below only
    /// takes what no `[[notify.webhook]]` entry wants.
    routes: Arc<Vec<Webhook>>,
    /// The door to the shared sender and its outbox (3.15.0).
    intake: Arc<crate::shell::notify_intake::Intake>,
}

impl Notifier {
    /// A notifier that logs only (no webhooks configured, or the feature
    /// is used without any `[[notify.webhook]]`).
    pub fn logging_only(service: &str) -> Self {
        Self {
            service: service.to_string(),
            tx: None,
            routes: Arc::default(),
            intake: Arc::default(),
        }
    }

    /// Start the drain task; returns the handle. `webhooks` may be empty.
    pub fn start(service: &str, webhooks: Vec<Webhook>, cfg: NotifyConfig) -> Self {
        let (n, drain) = Self::prepare(service, webhooks, cfg);
        if let Some(d) = drain {
            tokio::spawn(d);
        }
        n
    }

    /// Create the handle now (no runtime needed) and hand back the drain
    /// future to spawn once one exists — `App` builds the handle at parse
    /// time so a project can pass it into its handlers, and spawns the
    /// drain in `start`.
    pub fn prepare(
        service: &str,
        webhooks: Vec<Webhook>,
        cfg: NotifyConfig,
    ) -> (Self, Option<Drain>) {
        if webhooks.is_empty() {
            return (Self::logging_only(service), None);
        }
        let (tx, mut rx) = mpsc::channel::<Event>(cfg.queue_size.max(1));
        let hooks = Arc::new(webhooks);
        let routes = hooks.clone();
        let drain = async move {
            let client = reqwest::Client::builder()
                .timeout(cfg.timeout)
                .build()
                .expect("reqwest client");
            while let Some(event) = rx.recv().await {
                for hook in hooks.iter().filter(|h| h.wants(&event.kind)) {
                    deliver(&client, hook, &event, &cfg).await;
                }
            }
        };
        (
            Self {
                service: service.to_string(),
                tx: Some(tx),
                routes,
                intake: Arc::default(),
            },
            Some(Box::pin(drain)),
        )
    }

    /// Fire and forget. A full queue drops the event with one warning:
    /// blocking a request handler on a webhook would be the wrong trade.
    pub fn emit(&self, kind: &str, version: &str, detail: impl Into<String>) {
        self.emit_inner(kind, version, detail.into(), None);
    }

    /// [`Notifier::emit`] with kyu's damping: a repeat of `dedup` inside its
    /// window is not stored again by the hub and counts as delivered. Use it
    /// for failures that repeat (a backup that fails every night); a success
    /// message sends no key. Only the shared sender (primary and fallback
    /// targets) carries it; a `[[notify.webhook]]` entry sends as before.
    pub fn emit_keyed(
        &self,
        kind: &str,
        version: &str,
        detail: impl Into<String>,
        dedup: crate::core::notify_target::Dedup,
    ) {
        self.emit_inner(kind, version, detail.into(), Some(dedup));
    }

    fn emit_inner(
        &self,
        kind: &str,
        version: &str,
        detail: String,
        dedup: Option<crate::core::notify_target::Dedup>,
    ) {
        tracing::info!(event = kind, version, detail = %detail, "event");
        let event = Event {
            service: self.service.clone(),
            kind: kind.to_string(),
            at: now_rfc3339(),
            version: version.to_string(),
            detail,
        };
        if !self.routes.iter().any(|h| h.wants(kind)) {
            self.intake.offer(crate::shell::notify_intake::Queued {
                event: event.clone(),
                dedup,
            });
        }
        let Some(tx) = &self.tx else { return };
        if let Err(e) = tx.try_send(event) {
            tracing::warn!(error = %e, "notification queue full; event dropped (it is in the log above)");
        }
    }

    /// The door the shared sender connects to at start.
    #[cfg(feature = "dashboard")]
    pub(crate) fn intake(&self) -> Arc<crate::shell::notify_intake::Intake> {
        self.intake.clone()
    }
}

/// S5: what the log may say about a webhook — scheme and host only. The
/// path is where Home Assistant puts the webhook id, i.e. the secret.
pub fn redacted_url(url: &str) -> String {
    match url.split_once("://") {
        Some((scheme, rest)) => {
            let host = rest.split(['/', '?', '#']).next().unwrap_or("");
            // Strip userinfo too: `user:pass@host` never reaches the log.
            let host = host.rsplit('@').next().unwrap_or(host);
            format!("{scheme}://{host}/…")
        }
        None => "<unparseable url>".to_string(),
    }
}

async fn deliver(client: &reqwest::Client, hook: &Webhook, event: &Event, cfg: &NotifyConfig) {
    let body = match hook.render_body(event) {
        Ok(b) => b,
        Err(e) => {
            tracing::warn!(error = %e, url = %redacted_url(&hook.url), "webhook body template failed; event not sent");
            return;
        }
    };
    let targets: Vec<&str> = std::iter::once(hook.url.as_str())
        .chain(hook.fallback.as_deref())
        .collect();
    for (i, url) in targets.iter().enumerate() {
        if send_with_retries(client, hook, url, &body, cfg).await {
            if i > 0 {
                tracing::warn!(url = %redacted_url(url), "delivered via the fallback webhook");
            }
            return;
        }
    }
    tracing::warn!(event = %event.kind, url = %redacted_url(&hook.url), "notification not delivered after retries and fallback");
}

/// `retries` attempts with exponential backoff and jitter (backon).
async fn send_with_retries(
    client: &reqwest::Client,
    hook: &Webhook,
    url: &str,
    body: &str,
    cfg: &NotifyConfig,
) -> bool {
    use backon::{ExponentialBuilder, Retryable};
    let attempt = || async {
        let method =
            reqwest::Method::from_bytes(hook.method.as_bytes()).unwrap_or(reqwest::Method::POST);
        let mut req = client.request(method, url).body(body.to_string());
        let has_ct = hook
            .headers
            .keys()
            .any(|k| k.eq_ignore_ascii_case("content-type"));
        if !has_ct {
            req = req.header("content-type", "application/json");
        }
        for (k, v) in &hook.headers {
            req = req.header(k.as_str(), v.as_str());
        }
        let res = req.send().await.map_err(|e| e.to_string())?;
        if res.status().is_success() {
            Ok(())
        } else {
            Err(format!("HTTP {}", res.status()))
        }
    };
    let backoff = ExponentialBuilder::default()
        .with_min_delay(cfg.backoff_base)
        .with_max_delay(cfg.backoff_cap)
        .with_max_times(cfg.retries as usize)
        .with_jitter();
    match attempt.retry(backoff).await {
        Ok(()) => true,
        Err(e) => {
            tracing::warn!(url = %redacted_url(url), error = %e, "webhook failed after retries");
            false
        }
    }
}

#[cfg(test)]
mod tests;
