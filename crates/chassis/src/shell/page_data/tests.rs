//! PageData: the merged read, a part alone, and the setup refusal.

use std::time::Duration;

use axum::body::Body;
use axum::http::Request;
use serde_json::{Value, json};
use tower::ServiceExt;

use super::*;
use crate::core::error::Error;

fn page() -> Router {
    PageData::new("/api/page")
        .part("list", || async { Ok(json!([1, 2])) })
        .part("broken", || async {
            Err(Error::dependency("the store did not answer", "try again"))
        })
        .part("slow", || async {
            tokio::time::sleep(Duration::from_secs(5)).await;
            Ok(json!(0))
        })
        .timeout(Duration::from_millis(100))
        .router()
}

async fn get(path: &str) -> (u16, Value) {
    let res = page()
        .oneshot(Request::get(path).body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = res.status().as_u16();
    let body = axum::body::to_bytes(res.into_body(), 1 << 20)
        .await
        .unwrap();
    (status, serde_json::from_slice(&body).unwrap())
}

#[tokio::test]
async fn one_failing_part_is_its_own_error_and_the_rest_still_draws() {
    let (status, body) = get("/api/page").await;
    assert_eq!(status, 200);
    assert_eq!(body["parts"]["list"]["data"], json!([1, 2]));
    assert_eq!(body["parts"]["broken"]["error"], "the store did not answer");
    assert_eq!(body["parts"]["broken"]["remedy"], "try again");
    assert_eq!(body["parts"]["broken"]["status"], 502);
    assert_eq!(body["parts"]["slow"]["status"], 503, "timed out: {body}");
}

#[tokio::test]
async fn one_part_answers_alone_with_its_own_status() {
    assert_eq!(get("/api/page/list").await, (200, json!([1, 2])));
    assert_eq!(get("/api/page/broken").await.0, 502);
    let (status, body) = get("/api/page/nope").await;
    assert_eq!(status, 404);
    assert!(body.to_string().contains("list, broken, slow"), "{body}");
}

#[test]
#[should_panic(expected = "named twice")]
fn a_name_twice_is_refused_at_setup() {
    let _ = PageData::new("/p")
        .part("a", || async { Ok(json!(1)) })
        .part("a", || async { Ok(json!(2)) });
}
