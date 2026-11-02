//! Tests of the title and link: validation and the byte-level body.

use super::*;

fn event() -> Event {
    Event {
        service: "habits".into(),
        kind: "task.due".into(),
        at: "2026-11-02T08:00:00Z".into(),
        version: "1.2.0".into(),
        detail: "drink water".into(),
    }
}

const PLAIN: &str = r#"{"service":"habits","kind":"task.due","at":"2026-11-02T08:00:00Z","version":"1.2.0","detail":"drink water"}"#;

#[test]
fn without_a_link_the_body_is_what_it_always_was() {
    assert_eq!(body_json(&event(), None), PLAIN);
    assert_eq!(
        body_json(&event(), None),
        serde_json::to_string(&event()).unwrap()
    );
}

#[test]
fn title_and_url_follow_the_event_fields() {
    let both = Link::new(Some("Water drinken"), Some("/tasks/42")).unwrap();
    assert_eq!(
        body_json(&event(), Some(&both)),
        format!(
            "{},\"title\":\"Water drinken\",\"url\":\"/tasks/42\"}}",
            PLAIN.trim_end_matches('}')
        )
    );
    let url_only = Link::to("https://habits.example/tasks/42").unwrap();
    assert!(
        body_json(&event(), Some(&url_only))
            .ends_with(r#","url":"https://habits.example/tasks/42"}"#)
    );
    assert!(!body_json(&event(), Some(&url_only)).contains("title"));
    let title_only = Link::new(Some("Hello"), None).unwrap();
    assert!(body_json(&event(), Some(&title_only)).ends_with(r#","title":"Hello"}"#));
}

#[test]
fn a_url_must_be_an_app_path_or_an_http_address() {
    for ok in [
        "/",
        "/tasks/42?x=1#top",
        "http://h.example/a",
        "https://h.example",
    ] {
        assert!(Link::to(ok).is_ok(), "{ok}");
    }
    for bad in [
        "",
        "tasks/42",
        "//evil.example/x",
        "javascript:alert(1)",
        "ftp://h/x",
        "/a b",
        "/a\nb",
        "https://",
        "mailto:a@b.c",
    ] {
        let err = Link::to(bad).expect_err(bad);
        assert!(!err.remedy.is_empty(), "{bad}: a refusal says what to do");
    }
    assert!(Link::to(&format!("/{}", "a".repeat(MAX_URL_BYTES))).is_err());
}

#[test]
fn a_title_is_one_short_line_and_a_link_is_not_empty() {
    assert!(Link::new(Some("  "), None).is_err());
    assert!(Link::new(Some("two\nlines"), None).is_err());
    assert!(Link::new(Some(&"x".repeat(MAX_TITLE_CHARS + 1)), None).is_err());
    assert!(Link::new(Some(&"x".repeat(MAX_TITLE_CHARS)), None).is_ok());
    assert!(Link::new(None, None).is_err());
    assert_eq!(
        Link::new(Some(" Hi "), Some(" /a "))
            .unwrap()
            .title
            .as_deref(),
        Some("Hi")
    );
}
