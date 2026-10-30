//! Unit tests for `live`; kept in their own file so the module stays small.

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
    let mut s = Box::pin(live.stream(false, None));
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
    let mut s = Box::pin(live.stream(false, None));
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
    let mut s = Box::pin(live.stream(true, None));
    let e = next_text(&mut s).await;
    assert!(e.contains("resync") && e.contains("reconnected"), "{e}");
}

#[tokio::test]
async fn a_stream_ends_when_its_caller_is_no_longer_allowed() {
    let live = Live::new(8).recheck_every(Duration::from_millis(20));
    let flag = Arc::new(std::sync::atomic::AtomicBool::new(true));
    let f2 = flag.clone();
    let check: StillAllowed = Arc::new(move || {
        let f = f2.clone();
        Box::pin(async move { f.load(Ordering::SeqCst) })
    });
    let mut s = Box::pin(live.stream(false, Some(check)));
    live.publish_raw("a", "1");
    assert!(next_text(&mut s).await.contains('1'));
    flag.store(false, Ordering::SeqCst);
    let end = tokio::time::timeout(Duration::from_secs(5), s.next())
        .await
        .expect("the stream ends within 5 s");
    assert!(end.is_none(), "logged out: the stream is over");
}
