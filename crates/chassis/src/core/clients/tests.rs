//! Tests of the client records: issue, reissue, revoke, delete, lookups and the stored formats.

/// feat-api-3 (2.0.0): the kit stops offering the shape of a `Client` and
/// offers a way to make one, so a field added later cannot break a
/// consumer's build the way `fields` did in 1.9.0 (CF-15).
///
/// `#[non_exhaustive]` itself cannot be asserted from inside this crate —
/// it only restricts other crates — so what this proves is the half that
/// is testable here: the constructor fills every field, including the one
/// that caused the break, and a row it makes round-trips through the
/// store. Made to fail first by having `adopted` leave `uses` at 1.
#[test]
fn feat_api_3_adopted_fills_every_field_and_survives_the_store() {
    let c = Client::adopted("source-weather", "weather", "t0ken", "2026-09-10T02:16:47Z");
    assert_eq!(c.id, "source-weather");
    assert_eq!(c.name, "weather");
    assert_eq!(c.token.as_deref(), Some("t0ken"));
    assert_eq!(c.issued_at, "2026-09-10T02:16:47Z");
    assert_eq!(c.revoked_at, None);
    assert_eq!(c.last_used_at, None);
    assert_eq!(c.uses, 0);
    assert!(
        c.fields.is_empty(),
        "the field that broke 1.9.0 has a default"
    );

    let file = ClientsFile {
        clients: vec![c.clone()],
        ..Default::default()
    };
    let text = serde_json::to_string(&file).expect("serialise");
    let back: ClientsFile = serde_json::from_str(&text).expect("read back");
    assert_eq!(back.clients, vec![c]);
}

use super::*;

const T0: &str = "2026-09-05T07:00:00Z";
const T1: &str = "2026-09-05T07:05:00Z";

#[test]
fn issue_reissue_revoke_delete_lifecycle() {
    let mut f = ClientsFile::default();
    f.issue_with_fields(
        "home-assistant",
        "id-1".into(),
        "tok-a".into(),
        T0,
        Default::default(),
    )
    .unwrap();
    // Same active name is refused with a remedy naming re-issue.
    let err = f
        .issue_with_fields(
            "home-assistant",
            "id-2".into(),
            "tok-b".into(),
            T0,
            Default::default(),
        )
        .unwrap_err();
    assert!(err.remedy.contains("re-issue"));
    assert_eq!(f.by_token("tok-a").unwrap().name, "home-assistant");

    f.reissue("id-1", "tok-c".into(), T1).unwrap();
    assert!(
        f.by_token("tok-a").is_none(),
        "the old token stops working at once"
    );
    assert!(f.by_token("tok-c").is_some());

    f.revoke("id-1", T1).unwrap();
    assert!(
        f.by_token("tok-c").is_none(),
        "a revoked token is refused within the same call"
    );
    assert_eq!(f.get("id-1").unwrap().revoked_at.as_deref(), Some(T1));
    // The name is free again, the row stays.
    f.issue_with_fields(
        "home-assistant",
        "id-2".into(),
        "tok-d".into(),
        T1,
        Default::default(),
    )
    .unwrap();
    assert_eq!(f.clients.len(), 2);
    // Re-issuing a revoked row is refused.
    assert!(f.reissue("id-1", "x".into(), T1).is_err());

    let gone = f.delete("id-1").unwrap();
    assert_eq!(gone.id, "id-1");
    assert!(f.delete("id-1").is_err());
}

#[test]
fn names_are_validated() {
    assert!(validate_name("ok.name-1_").is_ok());
    assert!(validate_name("").is_err());
    assert!(validate_name("has space").is_err());
    assert!(validate_name(&"a".repeat(65)).is_err());
}

#[test]
fn touch_moves_last_used_and_counts() {
    let mut f = ClientsFile::default();
    f.issue_with_fields("n", "id".into(), "t".into(), T0, Default::default())
        .unwrap();
    assert!(f.get("id").unwrap().last_used_at.is_none());
    f.touch("id", T1);
    f.touch("id", T1);
    let c = f.get("id").unwrap();
    assert_eq!(c.last_used_at.as_deref(), Some(T1));
    assert_eq!(c.uses, 2);
}

#[test]
fn format_check_accepts_current_and_previous_only() {
    let mut f = ClientsFile::default();
    assert!(f.check_format().is_ok(), "current format");
    f.v = CLIENTS_FORMAT - 1;
    assert!(
        f.check_format().is_ok(),
        "K21: build N reads a store written by N-1"
    );
    f.v = CLIENTS_FORMAT + 1;
    let err = f.check_format().unwrap_err();
    assert!(
        err.remedy.contains("pre-update copy"),
        "a newer store is refused with the copy as remedy: {}",
        err.remedy
    );
    f.v = CLIENTS_FORMAT + 7;
    assert!(f.check_format().is_err());
}
/// feat-clients-2: a store written by 1.8.0 has no `fields` key at all.
/// It must read, and every client must come back with an empty map —
/// that is the whole migration, so it is pinned rather than trusted.
/// Drilled red by removing `#[serde(default …)]` from the field: the
/// parse then failed with "missing field `fields`".
#[test]
fn feat_clients_2_a_version_1_store_reads_and_has_no_fields() {
    let v1 = r#"{"v":1,"clients":[{"id":"id-1","name":"home-assistant",
        "token":"tok","issued_at":"2026-01-01T00:00:00Z","revoked_at":null,
        "last_used_at":null,"uses":3}]}"#;
    let f: ClientsFile = serde_json::from_str(v1).expect("a 1.8.0 store still reads");
    assert_eq!(f.v, 1);
    assert!(f.check_format().is_ok(), "the previous format is accepted");
    assert!(
        f.clients[0].fields.is_empty(),
        "a client from before this version carries no fields"
    );
}

/// feat-clients-2: what the project declared is kept with the client and
/// survives a write and a read. Drilled red by dropping `fields` from
/// the pushed `Client`: the value came back empty.
#[test]
fn feat_clients_2_declared_fields_survive_the_round_trip() {
    let mut f = ClientsFile::default();
    assert_eq!(f.v, 2, "a fresh store is written in the current format");
    let mut fields = BTreeMap::new();
    fields.insert("calendar".to_string(), "work-cal".to_string());
    f.issue_with_fields("almanac", "id-1".into(), "tok".into(), T0, fields)
        .unwrap();
    let text = serde_json::to_string(&f).unwrap();
    let back: ClientsFile = serde_json::from_str(&text).unwrap();
    assert_eq!(
        back.clients[0].fields.get("calendar").map(String::as_str),
        Some("work-cal")
    );
    let empty = ClientsFile::default();
    assert!(
        !serde_json::to_string(&empty).unwrap().contains("fields"),
        "an empty map is not written, so a project without fields sees no change"
    );
}

#[test]
fn homelab_shared_1_a_scope_is_stored_read_and_checked() {
    let mut f = ClientsFile::default();
    f.issue_scoped("wsl", " operate ", "id-1".into(), "t1".into(), T0)
        .unwrap();
    f.issue_with_fields("old", "id-2".into(), "t2".into(), T0, Default::default())
        .unwrap();
    let wsl = f.by_token("t1").unwrap();
    assert_eq!(wsl.scope(), Some("operate"), "trimmed");
    assert!(wsl.has_scope_in(&["operate", "all"]));
    assert!(!wsl.has_scope_in(&["read"]));
    let old = f.by_token("t2").unwrap();
    assert_eq!(old.scope(), None);
    assert!(
        !old.has_scope_in(&["read", "operate", "all"]),
        "unscoped = nothing"
    );
    assert!(
        f.issue_scoped("x", "  ", "id-3".into(), "t3".into(), T0)
            .is_err(),
        "empty scope refused"
    );
    let text = serde_json::to_string(&f).unwrap();
    let back: ClientsFile = serde_json::from_str(&text).unwrap();
    assert_eq!(back.by_token("t1").unwrap().scope(), Some("operate"));
}
