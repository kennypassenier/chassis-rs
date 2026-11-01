//! The pages speak the project's vocabulary, or say client without one.

use axum::Router;

use crate::fixtures::{app, http, id_of, issue, login};
use crate::html_text::{confirm_texts, iso_timestamp_in, says_client, visible_text};

// K28: with `vocabulary("source", "sources")` no kit page says "client" any
// more, the heading defaults to the capitalised plural, and the API paths
// stay what they were. Drilled red once by putting the literal word back in
// one sentence of clients.html.
#[tokio::test]
async fn k28_the_pages_speak_the_vocabulary_and_never_say_client() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = app(dir.path(), Router::new());
    app.vocabulary("source", "sources");
    app.test_route("POST", "/v1/events", "application/json", "{}");
    let running = app.start().await.unwrap();
    let addr = running.addr;

    let (_, _, login_page) = http(addr, "GET", "/login", &[], "").await;
    assert_eq!(
        says_client(&visible_text(&login_page)),
        None,
        "{login_page}"
    );
    assert!(
        login_page.contains("each has its own token on the Sources page"),
        "{login_page}"
    );

    let cookie = login(addr).await;
    let admin = [("Cookie", cookie.as_str())];

    let (_, _, empty) = http(addr, "GET", "/clients", &admin, "").await;
    let text = visible_text(&empty);
    assert_eq!(says_client(&text), None, "{empty}");
    assert!(empty.contains(">Sources</h1>"), "{empty}");
    assert!(empty.contains("No sources yet"), "{empty}");
    assert!(empty.contains("Issue a source"), "{empty}");
    assert!(
        empty.contains("Wire up your first source"),
        "the first-client walk-through speaks the vocabulary: {empty}"
    );
    assert!(empty.contains("vocabdemo — sources</title>"), "{empty}");
    assert!(
        empty.contains(">Sources</a>")
            && !empty.contains("href=\"/sources")
            && !empty.contains("href=\"&#x2f;sources"),
        "the nav label follows the vocabulary, the URL does not: {empty}"
    );

    let (status, body) = issue(addr, &cookie, "job-tracker").await;
    assert_eq!(status, 201, "{body}");
    let id = id_of(&body);
    let (_, _, full) = http(addr, "GET", "/clients", &admin, "").await;
    assert_eq!(says_client(&visible_text(&full)), None, "{full}");
    // Kenny 2026-10-21: the copy-paste command's variable follows the
    // vocabulary, and `CLIENT_TOKEN` is nowhere on the page.
    assert!(full.contains("export SOURCE_TOKEN="), "{full}");
    assert!(full.contains("Bearer $SOURCE_TOKEN"), "{full}");
    assert!(!full.contains("CLIENT_TOKEN"), "{full}");
    // ux-chassis-2: the onboarding cards are the empty state; once a source
    // exists the list takes their place. ux-chassis-3: the issue dialog
    // explains where requests go, in the page's vocabulary.
    for gone in [
        "Wire up your first source",
        "What a source is",
        "Waiting for a call",
    ] {
        assert!(
            !full.contains(gone),
            "{gone} outlived the first source: {full}"
        );
    }
    assert!(
        full.contains("Requests from this source will go to"),
        "{full}"
    );
    let (status, _, kit) = http(addr, "GET", "/api/kit/clients", &admin, "").await;
    assert_eq!(status, 200, "{kit}");
    let kit: serde_json::Value = serde_json::from_str(&kit).unwrap();
    assert_eq!(kit["token_var"], "SOURCE_TOKEN", "{kit}");
    assert!(
        kit["command_template"]
            .as_str()
            .unwrap()
            .contains("Bearer $SOURCE_TOKEN"),
        "{kit}"
    );
    assert!(!kit.to_string().contains("CLIENT_TOKEN"), "{kit}");
    assert!(
        full.contains("Registered sources (1)"),
        "the list heading speaks the vocabulary and counts exactly: {full}"
    );
    assert!(
        full.contains(&format!("data-kp-post=\"/api/clients/{id}/revoke\"")),
        "API paths are not vocabulary: {full}"
    );
    assert!(
        full.contains("Delete job-tracker and its history?"),
        "{full}"
    );
    // ask-1, second half (kp-themes 5.1.0): the wrap override is the
    // package's own knob now, and it belongs on the COLUMN. The kit marks
    // the state cell and leaves the badge plain, so a project's own badges
    // keep the package's protection — kp-themes measured what losing it
    // costs: one unbroken value 485 px wide on a 360 px viewport. Drilled
    // red by dropping `state-cell` from clients.html, and again by leaving
    // `state-badge` on the badge.
    assert!(
        full.contains("<td class=\"state-cell\" data-label=\"State\""),
        "the state column declares the wrap knob: {full}"
    );
    assert!(
        full.contains("<span class=\"kp-badge\">not used yet</span>"),
        "the badge itself is plain: {full}"
    );
    assert!(
        !full.contains("state-badge"),
        "the kit's own badge class is gone with 5.1.0: {full}"
    );

    // feat-ui-1: an RFC 3339 timestamp is written for a machine. The exact
    // value stays in `<time datetime="…">` — which `visible_text` strips —
    // so what is left is what a person actually reads. Kenny's case was
    // `2026-09-10T02:16:47Z` sitting in a live table column. Drilled red by
    // rendering `{{ c.issued_at }}` without the filter.
    let shown = visible_text(&full);
    assert!(
        iso_timestamp_in(&shown).is_none(),
        "a machine timestamp reached the page: {:?}",
        iso_timestamp_in(&shown)
    );
    assert!(
        full.contains("<time datetime=\""),
        "and the exact value is still there for whoever needs it: {full}"
    );

    // feat-clients-4: the row carries one control and nothing else. Kenny's
    // case was a row up to eight buttons wide across two wrapping columns,
    // whose height grew with whatever a project had registered. Counting the
    // buttons inside <tbody> is the assertion that survives a project adding
    // its own actions — those belong in the dialog now, not in the row.
    let body = full
        .split_once("<tbody>")
        .and_then(|(_, rest)| rest.split_once("</tbody>"))
        .map(|(inner, _)| inner.to_string())
        .expect("the clients table has a tbody");
    assert_eq!(
        body.matches("<button").count(),
        1,
        "one button per row, and this page has one {}: {body}",
        "client"
    );
    assert!(
        !full.contains("<th>Token</th>"),
        "the token column is gone from the table: {full}"
    );
    assert!(
        full.contains("data-manage=") && full.contains("manage-dialog"),
        "and the row's button opens the dialog that holds the rest: {full}"
    );

    // Every confirmation the kit renders is read by a person and is not
    // reached by `visible_text`, which strips attributes. Drilled red by
    // putting "caller" back in the Revoke confirmation.
    let confirms = confirm_texts(&full);
    assert!(
        confirms.iter().any(|c| c.contains("job-tracker")),
        "the confirmations name the thing by its own name: {confirms:?}"
    );
    for c in &confirms {
        assert_eq!(
            says_client(c),
            None,
            "a confirmation names the thing the project's own way: {c}"
        );
    }

    let (_, _, status_page) = http(addr, "GET", "/", &admin, "").await;
    assert_eq!(
        says_client(&visible_text(&status_page)),
        None,
        "{status_page}"
    );
    running.stop().await;
}

// K28: the default is still `client`/`clients`, heading `Clients`.
// Drilled red once by flipping the expectation to "Sources".
#[tokio::test]
async fn k28_without_vocabulary_the_pages_still_say_client() {
    let dir = tempfile::tempdir().unwrap();
    let running = app(dir.path(), Router::new()).start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let (_, _, page) = http(addr, "GET", "/clients", &[("Cookie", &cookie)], "").await;
    assert!(page.contains(">Clients</h1>"), "{page}");
    assert!(page.contains("Issue a client"), "{page}");
    assert!(page.contains("No clients yet"), "{page}");
    assert!(says_client(&visible_text(&page)).is_some(), "{page}");
    let (status, body) = issue(addr, &cookie, "job-tracker").await;
    assert_eq!(status, 201, "{body}");
    let (_, _, full) = http(addr, "GET", "/clients", &[("Cookie", &cookie)], "").await;
    assert!(full.contains("export CLIENT_TOKEN="), "{full}");
    running.stop().await;
}

// K28: `clients_label` keeps working next to the vocabulary — the label
// names the page, the vocabulary words the sentences. Drilled red once by
// making the label lose to the vocabulary's plural.
#[tokio::test]
async fn k28_clients_label_still_names_the_page_when_set() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = app(dir.path(), Router::new());
    app.vocabulary("source", "sources");
    app.clients_label("Feeds");
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let (_, _, page) = http(addr, "GET", "/clients", &[("Cookie", &cookie)], "").await;
    assert!(page.contains(">Feeds</h1>"), "{page}");
    assert!(page.contains("Issue a source"), "{page}");
    assert_eq!(says_client(&visible_text(&page)), None, "{page}");
    running.stop().await;
}
