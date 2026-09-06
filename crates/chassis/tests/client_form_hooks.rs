//! K16 (1.7.0): a project's extra fields on the issue form and its say
//! before a token is issued / after a client is deleted. Almanac's case: a
//! source is a name AND a calendar; one click makes the profile and the
//! token, and deleting the client deletes the profile. Driven through
//! `chassis::testing` (K25) since 1.8.0.
#![cfg(feature = "testing")]

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use chassis::shell::dashboard::ClientFormField;
use chassis::testing::TestApp;
use chassis::{AppSpec, Error};
use serde_json::json;

type Issued = Arc<Mutex<Vec<(String, BTreeMap<String, String>)>>>;

#[tokio::test]
async fn extra_fields_reach_the_issue_hook_and_a_refusal_issues_nothing() {
    let issued: Issued = Default::default();
    let deleted: Arc<Mutex<Vec<String>>> = Default::default();
    let seen = issued.clone();
    let gone = deleted.clone();
    let mut app = TestApp::start_with(
        AppSpec {
            name: "hookdemo",
            version: "0.0.0",
            ..Default::default()
        },
        axum::Router::new(),
        |app| {
            app.client_form_field(ClientFormField::select("calendar", "Calendar", || {
                vec![
                    ("cal-1".into(), "Household".into()),
                    ("cal-2".into(), "Work".into()),
                ]
            }));
            app.on_client_issued(move |client, fields| {
                if fields.get("calendar").map(String::as_str) == Some("cal-2") {
                    return Err(Error::invalid(
                        "the Work calendar is read-only",
                        "pick another calendar",
                    ));
                }
                seen.lock()
                    .unwrap()
                    .push((client.name.clone(), fields.clone()));
                Ok(())
            });
            let refuse_once = Arc::new(Mutex::new(true));
            app.on_client_deleted(move |client| {
                // The first attempt is refused (events still waiting), the
                // next one goes through — Almanac's rule.
                let mut first = refuse_once.lock().unwrap();
                if *first {
                    *first = false;
                    return Err(Error::invalid(
                        "job-tracker still has 2 events waiting",
                        "wait for the queue to drain",
                    ));
                }
                gone.lock().unwrap().push(client.name.clone());
                Ok(())
            });
        },
    )
    .await;
    app.login().await;

    // The page offers the field with today's options.
    let (_, page) = app.page("/clients").await;
    assert!(
        page.contains("<select class=\"kp-field__input\" id=\"field-calendar\" name=\"calendar\""),
        "{page}"
    );
    assert!(
        page.contains("<option value=\"cal-1\">Household</option>"),
        "{page}"
    );

    // A refused issue: the kit's error, and no client exists afterwards.
    let (status, body) = app
        .post_json(
            "/api/clients",
            json!({"name": "job-tracker", "calendar": "cal-2"}),
        )
        .await;
    assert_eq!(status, 400, "{body}");
    let text = body.to_string();
    assert!(
        text.contains("read-only") && text.contains("pick another calendar"),
        "{body}"
    );
    let (_, list) = app.get_json("/api/clients").await;
    assert_eq!(list, json!([]), "nothing was issued: {list}");
    assert!(issued.lock().unwrap().is_empty());

    // An accepted one: the hook saw the client-to-be and the field.
    let client = app
        .issue_client("job-tracker", &[("calendar", "cal-1")])
        .await;
    {
        let seen = issued.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].0, "job-tracker");
        assert_eq!(seen[0].1.get("calendar").unwrap(), "cal-1");
    }

    // A duplicate name is refused before the hook runs.
    let (status, body) = app
        .post_json(
            "/api/clients",
            json!({"name": "job-tracker", "calendar": "cal-1"}),
        )
        .await;
    assert_eq!(status, 400, "{body}");
    assert_eq!(
        issued.lock().unwrap().len(),
        1,
        "the hook did not run again"
    );

    // Deleting asks the project first: a refusal deletes nothing.
    let (status, body) = app.delete(&format!("/api/clients/{}", client.id)).await;
    assert_eq!(status, 400, "{body}");
    assert!(
        body.to_string().contains("wait for the queue to drain"),
        "{body}"
    );
    let (_, list) = app.get_json("/api/clients").await;
    assert!(
        list.to_string().contains("job-tracker"),
        "still there: {list}"
    );
    assert!(deleted.lock().unwrap().is_empty());
    let (status, _) = app.delete(&format!("/api/clients/{}", client.id)).await;
    assert_eq!(status, 204);
    assert_eq!(
        deleted.lock().unwrap().as_slice(),
        ["job-tracker".to_string()]
    );

    app.shutdown().await;
}
