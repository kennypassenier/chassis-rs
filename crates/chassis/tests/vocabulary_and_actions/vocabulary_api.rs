//! API refusals and the article follow the vocabulary.

use axum::Router;

use crate::fixtures::{app, http, id_of, issue, login};

// K28: the clients API refuses in the project's words — duplicate name,
// bad name, unknown id, revoked row — and every refusal keeps a remedy.
// Drilled red once by wording the duplicate refusal with "client" again.
#[tokio::test]
async fn k28_api_refusals_speak_the_vocabulary() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = app(dir.path(), Router::new());
    app.vocabulary("source", "sources");
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let admin = [("Cookie", cookie.as_str())];

    let (status, body) = issue(addr, &cookie, "job-tracker").await;
    assert_eq!(status, 201, "{body}");
    let id = id_of(&body);

    let (status, body) = issue(addr, &cookie, "job-tracker").await;
    assert_eq!(status, 400, "{body}");
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(
        v["error"],
        "a source named `job-tracker` already has a token"
    );
    assert_eq!(
        v["remedy"],
        "re-issue that source's token instead, or revoke it first to free the name"
    );

    let (status, body) = issue(addr, &cookie, "not allowed!").await;
    assert_eq!(status, 400, "{body}");
    assert!(
        body.contains("source name `not allowed!` is not allowed"),
        "{body}"
    );

    let (status, _, body) = http(addr, "POST", "/api/clients/no-such-id/reissue", &admin, "").await;
    assert_eq!(status, 404, "{body}");
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(v["error"], "no source with id no-such-id");
    assert!(v["remedy"].as_str().unwrap().contains("sources page"));

    let (status, _, _) = http(
        addr,
        "POST",
        &format!("/api/clients/{id}/revoke"),
        &admin,
        "",
    )
    .await;
    assert_eq!(status, 200);
    let (status, _, body) =
        http(addr, "GET", &format!("/api/clients/{id}/token"), &admin, "").await;
    assert_eq!(status, 400, "{body}");
    assert!(
        body.contains(&format!("source {id} is revoked")) && body.contains("issue a new source"),
        "{body}"
    );
    for word in ["client", "Client"] {
        assert!(!body.contains(word), "{body}");
    }
    running.stop().await;
}

// kit-r4 (kyu gap 53): "What a app is" -> "What an app is". The article follows
// the vocabulary's sound; a service overrides it where the rule is wrong; the
// palette and the API's refusal write it too.
#[tokio::test]
async fn kit_r4_the_article_follows_the_vocabulary() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = app(dir.path(), Router::new());
    app.vocabulary("app", "apps");
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let admin = [("Cookie", cookie.as_str())];

    let (_, _, page) = http(addr, "GET", "/clients", &admin, "").await;
    assert!(page.contains("What an app is"), "{page}");
    assert!(page.contains("Issue an app"), "{page}");
    assert!(page.contains("An app is one program"), "{page}");
    assert!(!page.contains("a app"), "{page}");
    assert!(page.contains("data-chassis-article=\"an\""), "{page}");

    let (status, _) = issue(addr, &cookie, "twice").await;
    assert_eq!(status, 201);
    let (_, _, full) = http(addr, "GET", "/clients", &admin, "").await;
    assert!(full.contains("Open an app to see"), "{full}");
    let (status, body) = issue(addr, &cookie, "twice").await;
    assert_eq!(status, 400, "{body}");
    assert!(body.contains("an app named `twice`"), "{body}");
}

#[tokio::test]
async fn kit_r4_a_service_can_override_the_article() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = app(dir.path(), Router::new());
    app.vocabulary("sms", "sms");
    app.vocabulary_article("an");
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let (_, _, page) = http(addr, "GET", "/clients", &[("Cookie", cookie.as_str())], "").await;
    assert!(page.contains("What an sms is"), "{page}");
    assert!(page.contains("Issue an sms"), "{page}");
}
