//! What a consumer sees of the declared client field and the project's own
//! metric series.

use super::support::*;

/// feat-clients-2 and feat-metrics-1, as a consumer actually uses them
/// (2026-09-10). The example is what a new project copies from, so the two
/// newest kit facilities have to be visible in it: a field this service needs
/// besides a name, and the project's own series beside the kit's.
#[test]
fn the_declared_field_and_the_project_series_are_what_a_consumer_sees() {
    let dir = tempfile::tempdir().unwrap();
    let (_child, addr) = start(dir.path());
    let base = format!("http://{addr}");
    let http = reqwest::blocking::Client::builder()
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let res = http
        .post(format!("{base}/login"))
        .form(&[("token", TOKEN)])
        .send()
        .unwrap();
    assert_eq!(res.status(), 303);

    // The declared field is refused when it is empty, with a remedy — the
    // hook may say no, and a project that only stored the value would have
    // let a useless column through. Made to fail first by returning Ok(())
    // from `on_client_issued`, which turned this 400 into a 201.
    let res = http
        .post(format!("{base}/api/clients"))
        .json(&serde_json::json!({ "name": "no-topic", "topic": "  " }))
        .send()
        .unwrap();
    assert_eq!(res.status(), 400, "an empty topic is refused");
    let body: serde_json::Value = res.json().unwrap();
    assert!(
        body["remedy"]
            .as_str()
            .unwrap_or("")
            .contains("topic field"),
        "and the refusal carries its remedy (rule 11): {body}"
    );

    // With a topic it is stored by the kit and comes back from the API and
    // the page, without the project writing any storage for it.
    let res = http
        .post(format!("{base}/api/clients"))
        .json(&serde_json::json!({ "name": "weather", "topic": "forecasts" }))
        .send()
        .unwrap();
    assert_eq!(res.status(), 201);
    let list: serde_json::Value = http
        .get(format!("{base}/api/clients"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    let row = list
        .as_array()
        .and_then(|rows| rows.iter().find(|c| c["name"] == "weather"))
        .expect("the client is listed");
    assert_eq!(
        row["fields"]["topic"], "forecasts",
        "the kit kept the declared field: {row}"
    );
    let html = http
        .get(format!("{base}/clients"))
        .send()
        .unwrap()
        .text()
        .unwrap();
    assert!(
        html.contains(">Topic</th>") && html.contains("forecasts"),
        "and renders it as a column under the project's own label"
    );

    // feat-metrics-1: the project's series carry the kit's prefix and sit in
    // the same scrape as the kit's own. Before any message the counter is
    // absent (a counter with no events has no series) and the gauge is 0.
    let token = {
        let id = row["id"].as_str().unwrap();
        let revealed: serde_json::Value = http
            .get(format!("{base}/api/clients/{id}/token"))
            .send()
            .unwrap()
            .json()
            .unwrap();
        revealed["token"].as_str().unwrap().to_string()
    };
    let res = http
        .post(format!("{base}/v1/messages"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "body": "hello" }))
        .send()
        .unwrap();
    assert_eq!(res.status(), 202);

    let metrics = http
        .get(format!("{base}/metrics"))
        .send()
        .unwrap()
        .text()
        .unwrap();
    assert!(
        metrics.contains("inbox_messages_received_total{from=\"weather\"} 1"),
        "the project's counter, labelled by the client the admin named: {metrics}"
    );
    assert!(
        metrics.contains("inbox_messages_stored 1"),
        "and its gauge: {metrics}"
    );
    assert!(
        metrics.contains("inbox_build_info") && metrics.contains("inbox_http_requests_total"),
        "beside the kit's own series in one scrape"
    );

    // The gauge follows the truth down; the counter does not, because the
    // messages were still received.
    assert_eq!(
        http.post(format!("{base}/messages/clear"))
            .send()
            .unwrap()
            .status(),
        204
    );
    let metrics = http
        .get(format!("{base}/metrics"))
        .send()
        .unwrap()
        .text()
        .unwrap();
    assert!(metrics.contains("inbox_messages_stored 0"), "{metrics}");
    assert!(
        metrics.contains("inbox_messages_received_total{from=\"weather\"} 1"),
        "a counter never decreases: {metrics}"
    );
}
