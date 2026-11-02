//! Tests of webhook specs: parsing, resolving, matching and refusals.

use super::*;

fn env() -> BTreeMap<String, String> {
    BTreeMap::from([("TOK".to_string(), "s3cret".to_string())])
}

fn event(kind: &str) -> Event {
    Event {
        service: "inbox".into(),
        kind: kind.into(),
        at: "2026-09-05T07:00:00Z".into(),
        version: "1.1.0".into(),
        detail: "1.0.0 → 1.1.0".into(),
    }
}

#[test]
fn parses_resolves_and_matches() {
    let t: toml::Table = r#"
[[notify.webhook]]
events = ["update.*", "health.degraded"]
url = "http://10.10.10.9:8080/t/ops.alerts"
headers = { Authorization = "Bearer ${TOK}" }
fallback = "http://ha/api/webhook/x"

[[notify.webhook]]
events = ["service.started"]
url = "http://other/hook"
method = "put"
body = '{"svc":"{{ service }}","what":"{{ kind }}"}'
"#
    .parse()
    .unwrap();
    let hooks = webhooks_from_table(&t, &env()).unwrap();
    assert_eq!(hooks.len(), 2);
    assert_eq!(hooks[0].headers["Authorization"], "Bearer s3cret");
    assert!(hooks[0].wants("update.ok"));
    assert!(hooks[0].wants("health.degraded"));
    assert!(!hooks[0].wants("service.started"));
    assert!(!hooks[0].wants("updates.ok"), "prefix match needs the dot");
    assert_eq!(hooks[1].method, "PUT");
    assert_eq!(
        hooks[1].render_body(&event("service.started")).unwrap(),
        r#"{"svc":"inbox","what":"service.started"}"#
    );
    let default_body = hooks[0].render_body(&event("update.ok")).unwrap();
    assert!(default_body.contains("\"kind\":\"update.ok\""));
}

#[test]
fn missing_var_bad_method_and_no_events_are_refused_with_remedies() {
    let t: toml::Table = "[[notify.webhook]]\nevents=[\"a\"]\nurl=\"http://h/${NOPE}\"\n"
        .parse()
        .unwrap();
    let err = webhooks_from_table(&t, &env()).unwrap_err();
    assert!(err.remedy.contains("export NOPE="));
    let t: toml::Table = "[[notify.webhook]]\nevents=[\"a\"]\nurl=\"http://h\"\nmethod=\"GET\"\n"
        .parse()
        .unwrap();
    assert!(
        webhooks_from_table(&t, &env())
            .unwrap_err()
            .message
            .contains("GET")
    );
    let t: toml::Table = "[[notify.webhook]]\nevents=[]\nurl=\"http://h\"\n"
        .parse()
        .unwrap();
    assert!(
        webhooks_from_table(&t, &env())
            .unwrap_err()
            .message
            .contains("no events")
    );
    let t: toml::Table = "[other]\nx=1\n".parse().unwrap();
    assert!(webhooks_from_table(&t, &env()).unwrap().is_empty());
}

#[test]
fn a_webhook_body_carries_title_and_url_when_the_app_set_them() {
    use crate::core::notify_link::Link;
    let t: toml::Table = r#"
[[notify.webhook]]
events = ["task.due"]
url = "http://h/default"

[[notify.webhook]]
events = ["task.due"]
url = "http://h/custom"
body = '{"what":"{{ kind }}"{% if url %},"open":"{{ url }}"{% endif %}{% if title %},"t":"{{ title }}"{% endif %}}'
"#
    .parse()
    .unwrap();
    let hooks = webhooks_from_table(&t, &env()).unwrap();
    let e = event("task.due");
    let link = Link::new(Some("Water drinken"), Some("/tasks/42")).unwrap();
    // Default body: the event as JSON, then title and url.
    assert_eq!(
        hooks[0].render_body_linked(&e, Some(&link)).unwrap(),
        r#"{"service":"inbox","kind":"task.due","at":"2026-09-05T07:00:00Z","version":"1.1.0","detail":"1.0.0 → 1.1.0","title":"Water drinken","url":"/tasks/42"}"#
    );
    assert_eq!(
        hooks[0].render_body_linked(&e, None).unwrap(),
        hooks[0].render_body(&e).unwrap(),
        "no link, no change"
    );
    // A custom template sees title and url as variables, absent when unset.
    assert_eq!(
        hooks[1].render_body_linked(&e, Some(&link)).unwrap(),
        r#"{"what":"task.due","open":"/tasks/42","t":"Water drinken"}"#
    );
    assert_eq!(
        hooks[1].render_body_linked(&e, None).unwrap(),
        r#"{"what":"task.due"}"#
    );
}

#[test]
fn only_the_kits_own_names_are_kit_events() {
    assert!(is_kit_event("update.ok") && is_kit_event("service.started"));
    assert!(!is_kit_event("task.due") && !is_kit_event("update.ok.extra"));
}
