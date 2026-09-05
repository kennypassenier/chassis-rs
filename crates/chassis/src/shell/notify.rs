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
}

impl Notifier {
    /// A notifier that logs only (no webhooks configured, or the feature
    /// is used without any `[[notify.webhook]]`).
    pub fn logging_only(service: &str) -> Self {
        Self {
            service: service.to_string(),
            tx: None,
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
            },
            Some(Box::pin(drain)),
        )
    }

    /// Fire and forget. A full queue drops the event with one warning:
    /// blocking a request handler on a webhook would be the wrong trade.
    pub fn emit(&self, kind: &str, version: &str, detail: impl Into<String>) {
        let detail = detail.into();
        tracing::info!(event = kind, version, detail = %detail, "event");
        let Some(tx) = &self.tx else { return };
        let event = Event {
            service: self.service.clone(),
            kind: kind.to_string(),
            at: now_rfc3339(),
            version: version.to_string(),
            detail,
        };
        if let Err(e) = tx.try_send(event) {
            tracing::warn!(error = %e, "notification queue full; event dropped (it is in the log above)");
        }
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
mod tests {
    use super::*;
    use axum::Router;
    use axum::routing::post;
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicUsize, Ordering};

    async fn receiver(fail_first: usize) -> (String, Arc<Mutex<Vec<(String, String)>>>) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let s2 = seen.clone();
        let failures = Arc::new(AtomicUsize::new(fail_first));
        let app = Router::new().route(
            "/hook",
            post(move |headers: axum::http::HeaderMap, body: String| {
                let s2 = s2.clone();
                let failures = failures.clone();
                async move {
                    if failures.load(Ordering::SeqCst) > 0 {
                        failures.fetch_sub(1, Ordering::SeqCst);
                        return axum::http::StatusCode::SERVICE_UNAVAILABLE;
                    }
                    let auth = headers
                        .get("authorization")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("")
                        .to_string();
                    s2.lock().unwrap().push((auth, body));
                    axum::http::StatusCode::OK
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (format!("http://{addr}/hook"), seen)
    }

    fn cfg() -> NotifyConfig {
        NotifyConfig {
            timeout: Duration::from_secs(2),
            retries: 3,
            backoff_base: Duration::from_millis(10),
            backoff_cap: Duration::from_millis(50),
            queue_size: 16,
        }
    }

    async fn wait_for(seen: &Arc<Mutex<Vec<(String, String)>>>, n: usize) {
        for _ in 0..100 {
            if seen.lock().unwrap().len() >= n {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!(
            "expected {n} deliveries, got {}",
            seen.lock().unwrap().len()
        );
    }

    #[tokio::test]
    async fn events_fan_out_with_headers_and_body_and_retry_past_a_failure() {
        let (url, seen) = receiver(1).await;
        let hook = Webhook {
            events: vec!["update.*".into()],
            url,
            method: "POST".into(),
            headers: std::collections::BTreeMap::from([(
                "Authorization".to_string(),
                "Bearer t".to_string(),
            )]),
            body: Some(r#"{"e":"{{ kind }}","v":"{{ version }}"}"#.into()),
            fallback: None,
        };
        let n = Notifier::start("inbox", vec![hook], cfg());
        n.emit("update.ok", "1.1.0", "served fine");
        n.emit("service.started", "1.1.0", "not wanted by this hook");
        wait_for(&seen, 1).await;
        let (auth, body) = seen.lock().unwrap()[0].clone();
        assert_eq!(
            auth, "Bearer t",
            "the header (with its $-reference already resolved) is sent, never logged"
        );
        assert_eq!(body, r#"{"e":"update.ok","v":"1.1.0"}"#);
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(
            seen.lock().unwrap().len(),
            1,
            "unwanted events are not sent"
        );
    }

    #[tokio::test]
    async fn fallback_receives_when_the_primary_stays_down() {
        let (fallback, seen) = receiver(0).await;
        let hook = Webhook {
            events: vec!["update.rolled_back".into()],
            url: "http://127.0.0.1:9/hook".into(), // nothing listens here
            method: "POST".into(),
            headers: Default::default(),
            body: None,
            fallback: Some(fallback),
        };
        let n = Notifier::start("inbox", vec![hook], cfg());
        n.emit("update.rolled_back", "1.1.0", "did not come up");
        wait_for(&seen, 1).await;
        assert!(
            seen.lock().unwrap()[0]
                .1
                .contains("\"kind\":\"update.rolled_back\"")
        );
    }

    #[test]
    fn logging_only_never_blocks() {
        let n = Notifier::logging_only("inbox");
        assert!(n.tx.is_none(), "no queue, so nothing to fill");
        let started = std::time::Instant::now();
        for i in 0..1000 {
            n.emit("service.started", "0.1.0", format!("event {i}"));
        }
        assert!(
            started.elapsed() < Duration::from_millis(500),
            "1000 emits took {:?}: emit must not block",
            started.elapsed()
        );
    }

    /// S5: the log never carries a webhook's path (that is where Home
    /// Assistant keeps the webhook id), nor userinfo.
    #[test]
    fn logged_webhook_urls_keep_only_scheme_and_host() {
        let r = redacted_url("https://ha.lan:8123/api/webhook/SECRET-HOOK-ID?x=1");
        assert_eq!(r, "https://ha.lan:8123/…");
        assert!(!r.contains("SECRET"));
        assert_eq!(
            redacted_url("http://user:pw@hub.lan/topics"),
            "http://hub.lan/…"
        );
        assert_eq!(redacted_url("garbage"), "<unparseable url>");
    }
}
