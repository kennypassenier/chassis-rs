//! Tests of the notification target: precedence, locking, address checks and the dedup contract.

use super::*;

fn fixed(value: &str) -> Fixed {
    Fixed {
        value: value.into(),
        by: "env",
        name: "SVC_NOTIFY_URL".into(),
        secret: true,
    }
}

fn inputs(f: Option<&str>, s: Option<&str>, c: Option<&str>) -> Inputs {
    Inputs {
        fixed: f.map(fixed),
        stored: s.map(str::to_string),
        code: c.map(str::to_string),
    }
}

#[test]
fn precedence_is_configuration_then_page_then_code_then_nothing() {
    let all = resolve(&inputs(
        Some("http://a/"),
        Some("http://b/"),
        Some("http://c/"),
    ));
    assert_eq!(
        (all.value.as_deref(), all.layer),
        (Some("http://a/"), Layer::Configuration)
    );
    assert!(all.locked());
    let no_cfg = resolve(&inputs(None, Some("http://b/"), Some("http://c/")));
    assert_eq!(
        (no_cfg.value.as_deref(), no_cfg.layer),
        (Some("http://b/"), Layer::Page)
    );
    assert!(!no_cfg.locked());
    let code = resolve(&inputs(None, None, Some("http://c/")));
    assert_eq!(
        (code.value.as_deref(), code.layer),
        (Some("http://c/"), Layer::Code)
    );
    let none = resolve(&inputs(None, None, None));
    assert_eq!((none.value, none.layer), (None, Layer::Default));
}

#[test]
fn a_saved_empty_value_is_a_choice_that_switches_off_the_code_default() {
    let t = resolve(&inputs(None, Some(""), Some("http://c/")));
    assert_eq!((t.value, t.layer), (None, Layer::Page));
    // Configuration that is empty also wins: "configured to have none".
    let t = resolve(&inputs(Some(""), Some("http://b/"), None));
    assert_eq!((t.value, t.layer), (None, Layer::Configuration));
}

#[test]
fn the_lock_reason_names_where_the_value_was_set() {
    assert!(
        fixed("x")
            .reason()
            .contains("environment variable SVC_NOTIFY_URL")
    );
    let file = Fixed {
        by: "file",
        name: "notify_url".into(),
        ..fixed("x")
    };
    assert!(file.reason().contains("config file"));
    let flag = Fixed {
        by: "flag",
        name: "--notify-url".into(),
        ..fixed("x")
    };
    assert!(flag.reason().contains("flag --notify-url"));
}

#[test]
fn addresses_are_checked_in_plain_words() {
    assert_eq!(
        check_url("  http://hub.example:8080/t/ops.alerts ").unwrap(),
        "http://hub.example:8080/t/ops.alerts"
    );
    assert!(check_url("https://ha.lan/api/webhook/x").is_ok());
    for (bad, needle) in [
        ("ftp://x/y", "only http://"),
        ("hub.example:8080/t/x", "must start with"),
        ("http://", "no host"),
        ("http:///path", "no host"),
        ("http://a b/", "space"),
    ] {
        let e = check_url(bad).unwrap_err();
        assert!(e.message.contains(needle), "{bad}: {}", e.message);
        assert!(!e.remedy.is_empty());
    }
    let long = format!("http://h/{}", "x".repeat(MAX_URL_BYTES));
    assert!(check_url(&long).unwrap_err().message.contains("longest"));
}

#[test]
fn dedup_key_and_window_follow_kyus_contract() {
    assert!(Dedup::new("backup|disk vol", Some("30m")).is_ok());
    assert!(Dedup::new("k", Some("7d")).is_ok());
    assert!(Dedup::new("k", Some("500")).is_ok());
    for bad in [
        ("", None),
        ("é", None),
        ("k", Some("8d")),
        ("k", Some("0s")),
        ("k", Some("5w")),
        ("k", Some("x")),
    ] {
        assert!(Dedup::new(bad.0, bad.1).is_err(), "{bad:?}");
    }
    assert!(Dedup::new("x".repeat(201), None).is_err());
    assert!(Dedup::new("x".repeat(200), None).is_ok());
}
