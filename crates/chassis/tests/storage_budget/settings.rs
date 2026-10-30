//! The budget setting: defaults, validation, precedence and the environment.

use chassis::testing::TestApp;
use reqwest::Method;
use serde_json::{Value, json};

use crate::fixtures::{SERIAL, set, start, stored};

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn budget_the_overview_names_the_setting_with_its_defaults() {
    let _one = SERIAL.lock().await;
    let (mut app, _db) = start("bset1", &[], 0, None).await;
    let (status, body) = app.get_json("/api/kit/storage").await;
    assert_eq!(status, 200, "{body}");
    let s = &body["budget"]["setting"];
    assert_eq!(s["budget_mb"], 50);
    assert_eq!(s["warn_mb"], 40);
    assert_eq!(s["default_budget_mb"], 50);
    assert_eq!(s["default_warn_mb"], 40);
    assert_eq!(s["stored"], false);
    assert_eq!(s["budget_fixed"], Value::Null);
    assert_eq!(s["warn_fixed"], Value::Null);
    assert_eq!(s["min_mb"], 1);
    assert_eq!(s["max_mb"], 100_000);
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn budget_validation_refuses_in_plain_words_and_changes_nothing() {
    let _one = SERIAL.lock().await;
    let (mut app, db) = start("bval", &[], 0, None).await;
    for (body, needle) in [
        (json!({"budget_mb": 0, "warn_mb": 0}), "1 to 100000"),
        (json!({"budget_mb": 100_001, "warn_mb": 10}), "1 to 100000"),
        (json!({"budget_mb": 10, "warn_mb": 10}), "below the budget"),
        (json!({"budget_mb": 10, "warn_mb": 0}), "at least 1 MB"),
        (json!({"budget_mb": 10.5, "warn_mb": 5}), "whole number"),
        (json!({"budget_mb": "ten", "warn_mb": 5}), "whole number"),
        (json!({"budget_mb": -3, "warn_mb": 2}), "whole number"),
        (json!({}), "nothing to change"),
    ] {
        let (status, answer) = set(&app, body.clone()).await;
        assert_eq!(status, 400, "{body}: {answer}");
        let text = answer.to_string();
        assert!(text.contains(needle), "{body}: wanted {needle}: {text}");
        assert!(answer["remedy"].is_string(), "{answer}");
    }
    // A warn line alone is checked against the budget in force.
    let (status, _) = set(&app, json!({"warn_mb": 50})).await;
    assert_eq!(status, 400, "warn 50 of 50 is not below the budget");
    assert_eq!(stored(&db, "storage_budget_mb"), None);
    assert_eq!(stored(&db, "storage_warn_mb"), None);
    let (_, body) = app.get_json("/api/kit/storage").await;
    assert_eq!(body["budget"]["budget_bytes"], 50_000_000);
    // The edges are accepted.
    let (status, answer) = set(&app, json!({"budget_mb": 100_000, "warn_mb": 99_999})).await;
    assert_eq!(status, 200, "{answer}");
    let (status, answer) = set(&app, json!({"budget_mb": 1, "warn_mb": 1})).await;
    assert_eq!(status, 200, "a 1 MB budget can only warn at 1 MB: {answer}");
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn budget_page_setting_beats_code_survives_in_the_file_and_reset_removes_it() {
    let _one = SERIAL.lock().await;
    let (mut app, db) = start("bprec", &[], 0, Some((100, Some(60)))).await;
    let (_, body) = app.get_json("/api/kit/storage").await;
    assert_eq!(body["budget"]["budget_bytes"], 100_000_000);
    assert_eq!(body["budget"]["setting"]["default_budget_mb"], 100);
    assert_eq!(body["budget"]["setting"]["default_warn_mb"], 60);

    let (status, answer) = set(&app, json!({"budget_mb": 20, "warn_mb": 15})).await;
    assert_eq!(status, 200, "{answer}");
    assert_eq!(answer["budget"]["budget_bytes"], 20_000_000);
    assert_eq!(answer["budget"]["warn_bytes"], 15_000_000);
    assert_eq!(answer["budget"]["setting"]["stored"], true);
    assert_eq!(stored(&db, "storage_budget_mb").as_deref(), Some("20"));
    assert_eq!(stored(&db, "storage_warn_mb").as_deref(), Some("15"));
    let (_, text) = TestApp::send_text(app.request(Method::GET, "/metrics")).await;
    assert!(
        text.contains("bprec_storage_budget_bytes 20000000"),
        "{text}"
    );
    assert!(text.contains("bprec_storage_warn_bytes 15000000"), "{text}");

    // A budget alone, below the old warn line, moves the warn line to 80 %.
    let (status, answer) = set(&app, json!({"budget_mb": 10})).await;
    assert_eq!(status, 200, "{answer}");
    assert_eq!(answer["budget"]["warn_bytes"], 8_000_000);

    let (status, answer) = set(&app, json!({"reset": true})).await;
    assert_eq!(status, 200, "{answer}");
    assert_eq!(answer["budget"]["budget_bytes"], 100_000_000, "code again");
    assert_eq!(answer["budget"]["warn_bytes"], 60_000_000);
    assert_eq!(answer["budget"]["setting"]["stored"], false);
    assert_eq!(stored(&db, "storage_budget_mb"), None);
    assert_eq!(stored(&db, "storage_warn_mb"), None);
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn budget_environment_wins_and_the_page_says_so() {
    let _one = SERIAL.lock().await;
    let (mut app, db) = start(
        "benv",
        &[
            ("BENV_STORAGE_BUDGET_MB", "20"),
            ("BENV_STORAGE_WARN_MB", "5"),
        ],
        0,
        Some((100, Some(90))),
    )
    .await;
    let (_, body) = app.get_json("/api/kit/storage").await;
    let s = &body["budget"]["setting"];
    assert_eq!(s["budget_mb"], 20);
    assert_eq!(s["warn_mb"], 5);
    assert_eq!(s["budget_fixed"]["by"], "env");
    assert_eq!(s["budget_fixed"]["name"], "BENV_STORAGE_BUDGET_MB");
    assert!(
        s["budget_fixed"]["reason"]
            .as_str()
            .unwrap()
            .contains("BENV_STORAGE_BUDGET_MB")
    );
    assert_eq!(s["warn_fixed"]["name"], "BENV_STORAGE_WARN_MB");
    assert_eq!(
        s["default_budget_mb"], 20,
        "reset can only go back to the fixed value"
    );

    let (status, answer) = set(&app, json!({"budget_mb": 30, "warn_mb": 25})).await;
    assert_eq!(status, 400, "{answer}");
    assert!(
        answer.to_string().contains("BENV_STORAGE_BUDGET_MB"),
        "{answer}"
    );
    assert_eq!(stored(&db, "storage_budget_mb"), None);
    // Saying the fixed value again is not a change.
    let (status, answer) = set(&app, json!({"budget_mb": 20, "warn_mb": 5})).await;
    assert_eq!(status, 200, "{answer}");
    assert_eq!(answer["budget"]["budget_bytes"], 20_000_000);
    app.shutdown().await;

    // Only the budget fixed: the warn line stays editable, below the fixed budget.
    let (mut app, _db) = start("benv2", &[("BENV2_STORAGE_BUDGET_MB", "20")], 0, None).await;
    let (status, answer) = set(&app, json!({"warn_mb": 12})).await;
    assert_eq!(status, 200, "{answer}");
    assert_eq!(answer["budget"]["budget_bytes"], 20_000_000);
    assert_eq!(answer["budget"]["warn_bytes"], 12_000_000);
    let (status, _) = set(&app, json!({"warn_mb": 20})).await;
    assert_eq!(status, 400);
    app.shutdown().await;
}
