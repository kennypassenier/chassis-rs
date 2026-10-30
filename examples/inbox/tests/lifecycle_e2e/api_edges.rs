//! The API door's edges: reissue and delete over HTTP, the rate limiters
//! answering 429, and an oversized body answering 413.

use super::support::*;

// H15 / K12 / W7: re-issue and delete over HTTP; the old token dies with
// each; /readyz does not exist (404, not a silent 200).
#[test]
fn reissue_and_delete_over_http_and_no_readyz() {
    let dir = tempfile::tempdir().unwrap();
    let (mut child, addr, _) = start_capturing(dir.path(), &[], &[]);
    let admin = login_jar(&addr);
    let (id, token) = issue_client(&admin, &addr, "rotating");
    let plain = reqwest::blocking::Client::new();
    let post = |t: &str| {
        plain
            .post(format!("http://{addr}/v1/messages"))
            .bearer_auth(t)
            .json(&serde_json::json!({"k": 1}))
            .send()
            .unwrap()
            .status()
            .as_u16()
    };
    assert_eq!(post(&token), 202);
    let reissued: serde_json::Value = admin
        .post(format!("http://{addr}/api/clients/{id}/reissue"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    assert_eq!(
        reissued["id"], id,
        "re-issue answers with the client row, never the token (K12)"
    );
    assert!(reissued.get("token").is_none(), "{reissued}");
    let revealed: serde_json::Value = admin
        .get(format!("http://{addr}/api/clients/{id}/token"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    let token2 = revealed["token"].as_str().unwrap().to_string();
    assert_ne!(token2, token);
    assert_eq!(post(&token), 401, "the old token is dead the same second");
    assert_eq!(post(&token2), 202, "the new token works");
    let res = admin
        .delete(format!("http://{addr}/api/clients/{id}"))
        .send()
        .unwrap();
    assert!(res.status().is_success(), "{}", res.status());
    assert_eq!(post(&token2), 401, "a deleted client's token is refused");
    let listed: serde_json::Value = admin
        .get(format!("http://{addr}/api/clients"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    assert!(
        listed.as_array().unwrap().iter().all(|c| c["id"] != id),
        "gone from the list"
    );
    // W7: no /readyz. An unknown path is never a 200 for a probe: the
    // no-redirect client sees the kit's answer itself (404, or the
    // dashboard's redirect to /login), not a followed login page.
    let no_redirect = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let status = no_redirect
        .get(format!("http://{addr}/readyz"))
        .send()
        .unwrap()
        .status()
        .as_u16();
    assert!(
        status == 404 || (300..400).contains(&status),
        "W7: /readyz answered {status}"
    );
    stop(&mut child);
}

// H3 / K10: both limiters are hit through the real router: login per IP,
// API per client token; each answers 429 with Retry-After.
#[test]
fn login_and_token_rate_limits_answer_429_with_retry_after() {
    let dir = tempfile::tempdir().unwrap();
    let (mut child, addr, _) = start_capturing(
        dir.path(),
        &[
            "--rate-limit-login-per-min",
            "3",
            "--rate-limit-login-burst",
            "3",
            "--rate-limit-token-per-sec",
            "2",
            "--rate-limit-token-burst",
            "2",
        ],
        &[],
    );
    let plain = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    // Log in first: the login limiter counts every attempt from this IP.
    let admin = login_jar(&addr);
    let (_id, token) = issue_client(&admin, &addr, "hammer");
    let mut api = Vec::new();
    let mut retry_after = None;
    for _ in 0..6 {
        let res = plain
            .post(format!("http://{addr}/v1/messages"))
            .bearer_auth(&token)
            .json(&serde_json::json!({"x": 1}))
            .send()
            .unwrap();
        if res.status().as_u16() == 429 {
            retry_after = res
                .headers()
                .get("retry-after")
                .map(|v| v.to_str().unwrap().to_string());
        }
        api.push(res.status().as_u16());
    }
    assert!(api.contains(&429), "token limiter never fired: {api:?}");
    assert!(
        api[..2].iter().all(|s| *s == 202),
        "the burst of 2 passes first: {api:?}"
    );
    assert!(retry_after.is_some(), "429 carries Retry-After");
    // The admin's own calls are not throttled by the token limiter.
    for _ in 0..6 {
        assert_eq!(
            admin
                .get(format!("http://{addr}/api/clients"))
                .send()
                .unwrap()
                .status()
                .as_u16(),
            200
        );
    }
    // Now the login limiter: 3 per minute, burst 3; one succeeded above.
    let mut statuses = Vec::new();
    for _ in 0..5 {
        statuses.push(
            plain
                .post(format!("http://{addr}/login"))
                .form(&[("token", "wrong-token-wrong-token-wrong")])
                .send()
                .unwrap()
                .status()
                .as_u16(),
        );
    }
    assert!(
        statuses.contains(&429),
        "login limiter never fired: {statuses:?}"
    );
    assert_ne!(statuses[0], 429, "the burst passes first: {statuses:?}");
    stop(&mut child);
}

// S3 / K10 / K13: a body above max_body_bytes on a CAPTURED api route is a
// 413, not an empty body handed to the handler.
#[test]
fn oversized_body_on_an_api_route_is_413_not_empty() {
    let dir = tempfile::tempdir().unwrap();
    let (mut child, addr, _) = start_capturing(dir.path(), &["--max-body-bytes", "2048"], &[]);
    let admin = login_jar(&addr);
    let (_id, token) = issue_client(&admin, &addr, "big");
    let plain = reqwest::blocking::Client::new();
    let big = serde_json::json!({"payload": "x".repeat(4096)});
    let res = plain
        .post(format!("http://{addr}/v1/messages"))
        .bearer_auth(&token)
        .json(&big)
        .send()
        .unwrap();
    assert_eq!(res.status().as_u16(), 413);
    // A declared Content-Length is refused by the limit layer, a streamed
    // body by the capture layer (S3); both answer the kit's JSON shape with
    // a remedy (AR4), never a 2xx with an empty payload.
    let body: serde_json::Value = res.json().unwrap();
    assert!(
        body["remedy"].as_str().unwrap().contains("max_body_bytes"),
        "{body}"
    );
    let streamed = plain
        .post(format!("http://{addr}/v1/messages"))
        .bearer_auth(&token)
        .header("content-type", "application/json")
        .body(reqwest::blocking::Body::new(std::io::Cursor::new(
            serde_json::to_vec(&big).unwrap(),
        )))
        .send()
        .unwrap();
    assert_eq!(
        streamed.status().as_u16(),
        413,
        "a chunked oversized body is 413 too (S3)"
    );
    let headers = format!("{:?}", streamed.headers());
    let text = streamed.text().unwrap();
    let body: serde_json::Value = serde_json::from_str(&text).unwrap_or_else(|e| {
        panic!("streamed 413 body is not JSON ({e}); headers {headers}; body {text:?}")
    });
    assert!(
        body["remedy"].as_str().unwrap().contains("max_body_bytes"),
        "{body}"
    );
    // A fresh client: after a 413 with an unread body the server closes the
    // connection, and a pooled reuse of it races that close (seen once in
    // the kit's gates as `IncompleteMessage`, 2026-09-06). Real callers see
    // the same and reconnect; the assertion is about the service, not the
    // pool.
    let small = reqwest::blocking::Client::new()
        .post(format!("http://{addr}/v1/messages"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"payload": "ok"}))
        .send()
        .unwrap();
    assert_eq!(small.status().as_u16(), 202);
    stop(&mut child);
}
