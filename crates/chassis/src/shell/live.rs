//! A live channel to the browser (feat-live-1): Server-Sent Events.
//!
//! A project creates one [`Live`] at start, hands clones to whatever
//! changes state (a deploy, a pump, a poller) and calls
//! [`Live::publish`]; every browser subscribed to [`Live::router`]'s path
//! receives the event. SSE rather than WebSockets: one direction is all a
//! dashboard needs, it is plain HTTP through Traefik and the kit's
//! middleware, and the browser's `EventSource` reconnects by itself.
//!
//! What the channel promises and what it does not:
//!
//! * Events are numbered from 1 per process; the number is the SSE `id`.
//! * A browser that falls more than `capacity` events behind is not
//!   buffered without bound: it receives one `resync` event (data: how many
//!   it missed) and should fetch the state again. So does a browser that
//!   reconnects with a `Last-Event-ID`, since nothing is kept to replay.
//! * A comment line goes out every 15 s so a proxy does not close an idle
//!   connection.
//!
//! The route is unprotected by itself. Pass the router to
//! `App::dashboard_routes` for the admin login or `App::api_routes` for a
//! client token — the channel carries whatever the project publishes, so
//! the project decides who may read it.

use std::convert::Infallible;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use axum::Router;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::get;
use futures_util::Stream;
use tokio::sync::broadcast;

use crate::core::error::Error;

/// One published event, shared by every subscriber.
#[derive(Clone, Debug)]
struct Message {
    id: u64,
    name: Arc<str>,
    data: Arc<str>,
}

/// The publishing side; cheap to clone.
#[derive(Clone)]
pub struct Live {
    tx: broadcast::Sender<Message>,
    next: Arc<AtomicU64>,
}

impl Live {
    /// `capacity` events are held for a slow browser before it is told to
    /// resync. 256 covers a burst of state changes; nothing is kept for a
    /// browser that is not connected.
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity.max(1));
        Live {
            tx,
            next: Arc::new(AtomicU64::new(1)),
        }
    }

    /// Send `data` as JSON under the event name `event`. Returns how many
    /// browsers were subscribed; none is not an error.
    pub fn publish<T: serde::Serialize>(&self, event: &str, data: &T) -> Result<usize, Error> {
        let json = serde_json::to_string(data).map_err(|e| {
            Error::internal(
                format!("the live event `{event}` does not serialise: {e}"),
                "report this; the value passed to Live::publish must serialise to JSON",
            )
        })?;
        Ok(self.publish_raw(event, &json))
    }

    /// Send a line of text as-is under `event`; a newline in it is sent as
    /// the next `data:` line, which `EventSource` joins back.
    pub fn publish_raw(&self, event: &str, data: &str) -> usize {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        self.tx
            .send(Message {
                id,
                name: event.into(),
                data: data.into(),
            })
            .unwrap_or(0)
    }

    /// Browsers connected right now.
    pub fn subscribers(&self) -> usize {
        self.tx.receiver_count()
    }

    /// `GET path` as an SSE stream. Mount it with `dashboard_routes`
    /// (admin login) or `api_routes` (client token).
    pub fn router(&self, path: &str) -> Router {
        Router::new()
            .route(path, get(subscribe))
            .with_state(self.clone())
    }

    fn stream(&self, reconnected: bool) -> impl Stream<Item = Result<Event, Infallible>> + use<> {
        let rx = self.tx.subscribe();
        // A reconnecting browser missed whatever was sent while it was
        // away, and nothing is kept to replay: it starts with a resync.
        let first = reconnected.then(|| Event::default().event("resync").data("reconnected"));
        futures_util::stream::unfold((rx, first), |(mut rx, first)| async move {
            if let Some(e) = first {
                return Some((Ok(e), (rx, None)));
            }
            let e = match rx.recv().await {
                Ok(m) => Event::default()
                    .id(m.id.to_string())
                    .event(&*m.name)
                    .data(&*m.data),
                // Behind by `n`: say so once instead of buffering without
                // bound; the browser fetches the state again.
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    Event::default().event("resync").data(n.to_string())
                }
                Err(broadcast::error::RecvError::Closed) => return None,
            };
            Some((Ok(e), (rx, None)))
        })
    }
}

async fn subscribe(
    State(live): State<Live>,
    headers: HeaderMap,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let reconnected = headers.contains_key("last-event-id");
    Sse::new(live.stream(reconnected))
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;

    async fn next_text(s: &mut (impl Stream<Item = Result<Event, Infallible>> + Unpin)) -> String {
        let e = tokio::time::timeout(Duration::from_secs(5), s.next())
            .await
            .expect("an event within 5 s")
            .expect("the stream is open")
            .unwrap();
        // `Event` renders to its wire form through its Debug-free API only
        // via the response body; the fields are checked there in the
        // router test. Here the stream shape is enough.
        format!("{e:?}")
    }

    #[tokio::test]
    async fn a_subscriber_receives_what_is_published_in_order() {
        let live = Live::new(8);
        let mut s = Box::pin(live.stream(false));
        assert_eq!(live.subscribers(), 1);
        assert_eq!(
            live.publish("stack", &serde_json::json!({"name": "media"}))
                .unwrap(),
            1
        );
        live.publish_raw("ping", "two");
        let first = next_text(&mut s).await;
        assert!(first.contains("media"), "{first}");
        let second = next_text(&mut s).await;
        assert!(second.contains("two"), "{second}");
    }

    #[tokio::test]
    async fn a_slow_subscriber_is_told_to_resync_instead_of_buffered() {
        let live = Live::new(2);
        let mut s = Box::pin(live.stream(false));
        for i in 0..5 {
            live.publish_raw("n", &i.to_string());
        }
        let e = next_text(&mut s).await;
        assert!(e.contains("resync"), "{e}");
        assert!(e.contains('3'), "it says how many it missed: {e}");
    }

    #[tokio::test]
    async fn publishing_with_nobody_listening_is_not_an_error() {
        let live = Live::new(4);
        assert_eq!(live.publish_raw("x", "y"), 0);
        assert_eq!(live.subscribers(), 0);
    }

    #[tokio::test]
    async fn the_route_speaks_sse_on_the_wire() {
        use axum::body::Body;
        use axum::http::Request;
        use tower::ServiceExt;
        let live = Live::new(8);
        let router = live.router("/events");
        let res = router
            .oneshot(Request::get("/events").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), 200);
        assert_eq!(res.headers()["content-type"], "text/event-stream");
        let mut body = res.into_body().into_data_stream();
        // Publish once the subscription exists (the handler ran).
        for _ in 0..50 {
            if live.subscribers() == 1 {
                break;
            }
            tokio::task::yield_now().await;
        }
        live.publish("deploy", &serde_json::json!({"stack": "media", "ok": true}))
            .unwrap();
        let chunk = tokio::time::timeout(Duration::from_secs(5), body.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let text = String::from_utf8_lossy(&chunk);
        assert!(text.contains("event: deploy"), "{text}");
        assert!(text.contains("id: 1"), "{text}");
        assert!(
            text.contains(r#"data: {"ok":true,"stack":"media"}"#)
                || text.contains(r#"data: {"stack":"media","ok":true}"#),
            "{text}"
        );
    }

    #[tokio::test]
    async fn a_reconnecting_browser_starts_with_a_resync() {
        let live = Live::new(8);
        let mut s = Box::pin(live.stream(true));
        let e = next_text(&mut s).await;
        assert!(e.contains("resync") && e.contains("reconnected"), "{e}");
    }
}
