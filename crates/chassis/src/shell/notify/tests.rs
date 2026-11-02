//! Unit tests for `notify`; kept in their own file so the module stays small.

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

/// A local port that refuses at once. A fixed low port (1, 9) is not
/// that everywhere: on WSL2 a connect there hangs until the timeout.
fn refused_url(path: &str) -> String {
    let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = l.local_addr().unwrap().port();
    drop(l);
    format!("http://127.0.0.1:{port}{path}")
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
        url: refused_url("/hook"), // nothing listens here
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

/// W2: the backoff ladder stays inside [base, 2×cap] over a thousand
/// samples — jitter adds at most one more delay, never a runaway.
#[test]
fn backoff_delays_stay_within_base_and_twice_the_cap() {
    use backon::BackoffBuilder;
    let base = Duration::from_millis(50);
    let cap = Duration::from_millis(800);
    let mut n = 0;
    for _ in 0..200 {
        let ladder = backon::ExponentialBuilder::default()
            .with_min_delay(base)
            .with_max_delay(cap)
            .with_max_times(5)
            .with_jitter()
            .build();
        for d in ladder {
            n += 1;
            assert!(d >= base, "{d:?} below the base");
            assert!(d <= cap * 2, "{d:?} above twice the cap");
        }
    }
    assert_eq!(n, 1000, "5 delays per ladder × 200");
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

/// [fix-notify-log-1]: the log line of an event names the kind and version,
/// never the detail text (apps put health data in it).
#[test]
fn the_event_log_line_never_carries_the_detail_text() {
    #[derive(Clone, Default)]
    struct Capture(Arc<Mutex<Vec<u8>>>);
    impl std::io::Write for Capture {
        fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(b);
            Ok(b.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let cap = Capture::default();
    let writer = cap.clone();
    let subscriber = tracing_subscriber::fmt()
        .with_writer(move || writer.clone())
        .with_ansi(false)
        .finish();
    tracing::subscriber::with_default(subscriber, || {
        // Other tests ran this callsite with no subscriber and cached "off".
        tracing::callsite::rebuild_interest_cache();
        Notifier::logging_only("med").emit("dose.missed", "1.2.3", "metformin 500 mg skipped");
    });
    let logs = String::from_utf8(cap.0.lock().unwrap().clone()).unwrap();
    assert!(
        logs.contains("dose.missed") && logs.contains("1.2.3"),
        "{logs}"
    );
    assert!(!logs.contains("metformin"), "the detail leaked: {logs}");
}
