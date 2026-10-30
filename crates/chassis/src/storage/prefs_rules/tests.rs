//! Tests of the browser-key declaration, the shared fixture and the rules
//! `Prefs` applies to keys and values.

use super::*;
use crate::storage::MemoryPrefStore;

fn homelab() -> BrowserKeys {
    BrowserKeys::new()
        .prefix("homelab.")
        .prefix("homelab-")
        .prefix("nx-sort:")
        .prefix("kp-remember:")
        .except_exact("homelab.theme-follow-system")
        .except_exact("homelab.theme-light")
        .except_exact("homelab.theme-dark")
}

/// Homelab's declaration (coordinator, 2026-10-21): the allow-list
/// carries its prefixes, the pre-login theme keys stay local, a running
/// flow marker syncs, and nothing undeclared does.
#[test]
fn homelabs_allow_list_and_exceptions_decide_which_keys_sync() {
    let k = homelab();
    for yes in [
        "homelab.log-levels",
        "homelab-toured",
        "homelab-update-jobs",
        "nx-sort:stacks",
        "kp-remember:datatable:status:sort",
        "homelab.stacks.view",
    ] {
        assert!(k.is_synced(yes), "{yes} syncs");
    }
    for no in [
        "homelab.theme-follow-system",
        "homelab.theme-light",
        "homelab.theme-dark",
        "theme",
        "homelab",
        "other.key",
        "kp:remember",
    ] {
        assert!(!k.is_synced(no), "{no} stays in the browser");
    }
    // The exception beats the allow-list, including for a prefix.
    let k = homelab().except_prefix("homelab.stacks.");
    assert!(!k.is_synced("homelab.stacks.view"));
    assert!(k.is_synced("homelab.map.deplist"));
    k.validate().unwrap();
}

/// The rule table both sides share: the browser script's test reads the
/// same file, so server and script cannot drift (Kenny's locking-test
/// rule). Homelab's declaration, session draft prefix included.
#[test]
fn the_shared_fixture_decides_the_same_on_the_server() {
    let fx: Json =
        serde_json::from_str(include_str!("../../../tests/fixtures/sync_rules.json")).unwrap();
    let list = |name: &str| -> Vec<String> {
        fx["synced"][name]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect()
    };
    let mut k = BrowserKeys::new();
    for v in list("exact") {
        k = k.exact(&v);
    }
    for v in list("prefix") {
        k = k.prefix(&v);
    }
    for v in list("session_exact") {
        k = k.session_exact(&v);
    }
    for v in list("session_prefix") {
        k = k.session_prefix(&v);
    }
    for v in list("except_exact") {
        k = k.except_exact(&v);
    }
    for v in list("except_prefix") {
        k = k.except_prefix(&v);
    }
    k.validate().unwrap();
    assert_eq!(
        serde_json::to_value(k.to_json()).unwrap()["session_prefix"],
        fx["synced"]["session_prefix"]
    );
    for c in fx["cases"].as_array().unwrap() {
        let key = c["key"].as_str().unwrap();
        assert_eq!(k.is_synced_local(key), c["local"], "{key} local");
        assert_eq!(k.is_synced_session(key), c["session"], "{key} session");
    }
}

#[tokio::test]
async fn a_form_draft_with_a_password_field_is_never_stored() {
    let p = Prefs::new(
        Arc::new(MemoryPrefStore::new()),
        BrowserKeys::new().session_prefix("kp-unsaved:"),
        PrefLimits::default(),
    );
    let key = "kp-unsaved:/settings:settings";
    p.put("admin", key, r#"{"port":"8081","name":"x"}"#)
        .await
        .unwrap();
    for bad in [
        r#"{"port":"1","password":"hunter2"}"#,
        r#"{"admin_token":"abc"}"#,
        r#"{"api_key":"abc"}"#,
    ] {
        assert!(p.put("admin", key, bad).await.is_err(), "{bad}");
    }
}

#[test]
fn a_declaration_that_names_a_secret_or_everything_is_refused() {
    for bad in ["session-token", "app.secret.", "x.password", "API_KEY"] {
        assert!(
            BrowserKeys::new().prefix(bad).validate().is_err(),
            "{bad} is refused"
        );
    }
    assert!(BrowserKeys::new().validate().is_err(), "nothing declared");
    assert!(
        BrowserKeys::new().prefix("").validate().is_err(),
        "the empty prefix would sync everything"
    );
    assert!(BrowserKeys::new().prefix("a\nb").validate().is_err());
    assert!(BrowserKeys::new().prefix("..").validate().is_err());
    assert!(
        BrowserKeys::new()
            .prefix(&"k".repeat(257))
            .validate()
            .is_err(),
        "over the length limit"
    );
    // Any other name is fine: spaces, slashes, colons, non-ASCII.
    BrowserKeys::new()
        .prefix("my app/ключ ")
        .exact("nx-sort:Mijn tabel #1?")
        .validate()
        .unwrap();
    assert!(
        BrowserKeys::new()
            .prefix("a.")
            .max_value_bytes(100)
            .max_scope_bytes(10)
            .validate()
            .is_err()
    );
    BrowserKeys::new().prefix("a.").validate().unwrap();
}

fn prefs(max_value: u64, max_scope: u64, max_keys: u64) -> Prefs {
    Prefs::new(
        Arc::new(MemoryPrefStore::new()),
        BrowserKeys::new().prefix("app."),
        PrefLimits {
            max_value_bytes: max_value,
            max_scope_bytes: max_scope,
            max_keys,
        },
    )
}

#[tokio::test]
async fn the_rules_refuse_what_was_not_declared_and_what_looks_secret() {
    let p = prefs(64, 1024, 10).forbid_values(vec!["hunter2-hunter2".into()]);
    p.put("admin", "app.a", "1").await.unwrap();
    assert!(p.put("admin", "other", "1").await.is_err(), "undeclared");
    assert!(p.put("admin", "app.x\ty", "1").await.is_err(), "control");
    p.put("admin", "app.x y/é:%?#", "1").await.unwrap();
    assert!(p.put("admin", "app.token", "1").await.is_err(), "name");
    assert!(p.put("admin", "app.v", &"x".repeat(65)).await.is_err());
    for secret in [
        "-----BEGIN PRIVATE KEY-----",
        "Bearer abcdefghijklmnopqrstuvwxyz",
        "{\"t\":\"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk\"}",
        "pw hunter2-hunter2 here",
    ] {
        assert!(p.put("admin", "app.v", secret).await.is_err(), "{secret}");
    }
    // Ordinary JSON of a preference passes.
    p.put("admin", "app.v", r#"{"sort":[["name","asc"]],"page":2}"#)
        .await
        .unwrap();
    assert_eq!(p.list("admin", "").await.unwrap().len(), 3);
}
