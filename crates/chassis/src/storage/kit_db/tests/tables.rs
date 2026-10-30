//! Tests of the clients, sessions and passkeys tables: sealed fields, plain
//! ids, replace-by-diff, and that no Storage kind can name them.

use super::*;

#[test]
fn clients_round_trip_with_tokens_and_fields_sealed_but_names_plain() {
    let dir = tempfile::tempdir().unwrap();
    let k = kit(dir.path());
    k.save_clients(&clients()).unwrap();
    let back = k.load_clients().unwrap();
    assert_eq!(back, clients());
    assert!(
        back.get("id-2").unwrap().token.is_none(),
        "a revoked client has no secret on disk"
    );
    let raw = raw_bytes(dir.path());
    assert!(
        !contains(&raw, "very-secret-token-1"),
        "the token never touches disk in plain"
    );
    assert!(
        !contains(&raw, "private-calendar-id"),
        "nor does a field value"
    );
    assert!(
        contains(&raw, "other"),
        "a name is a plain column: the file can be read without the key"
    );
    // A wrong key cannot read the secrets back.
    let db = Db::open(&dir.path().join("svc-kit.db"), &kit_migrations()).unwrap();
    let wrong = KitDb::new(db, Key::from_bytes([6u8; 32]));
    let err = wrong.load_clients().unwrap_err();
    assert!(err.remedy.contains("rekey"), "{err}");
}

#[test]
fn a_save_replaces_the_set_inserts_updates_and_removes() {
    let dir = tempfile::tempdir().unwrap();
    let k = kit(dir.path());
    let mut f = clients();
    k.save_clients(&f).unwrap();
    f.touch("id-1", "2026-09-07T00:00:00Z");
    f.delete("id-2").unwrap();
    k.save_clients(&f).unwrap();
    let back = k.load_clients().unwrap();
    assert_eq!(back.clients.len(), 1);
    assert_eq!(back.get("id-1").unwrap().uses, 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn sessions_round_trip_and_only_expired_ones_are_pruned() {
    let dir = tempfile::tempdir().unwrap();
    let k = kit(dir.path());
    let mut f = SessionsFile::default();
    f.create("live", 1_000, 5_000, false);
    f.create("kept", 1_000, 9_000, true);
    f.create("dead", 1_000, 100, false);
    k.save_sessions(f.clone()).await.unwrap();
    assert_eq!(k.load_sessions().unwrap(), f);
    assert!(
        !contains(&raw_bytes(dir.path()), "live"),
        "only the hash is stored"
    );
    assert_eq!(
        k.prune_expired_sessions(2_000).unwrap(),
        1,
        "exactly the expired one"
    );
    let left = k.load_sessions().unwrap();
    assert_eq!(left.sessions.len(), 2);
    assert!(left.is_live("live", 2_000) && left.is_live("kept", 2_000));
    assert_eq!(k.prune_expired_sessions(2_000).unwrap(), 0);
}

#[test]
fn passkey_credentials_are_sealed_and_ids_are_plain() {
    let dir = tempfile::tempdir().unwrap();
    let k = kit(dir.path());
    let rows = vec![PasskeyRow {
        id: "pk-1".into(),
        label: "laptop".into(),
        created_at: "2026-09-05T07:00:00Z".into(),
        last_used_at: None,
        credential_json: "{\"cred\":\"top-secret-credential\"}".into(),
    }];
    k.save_passkeys(&rows).unwrap();
    assert_eq!(k.load_passkeys().unwrap(), rows);
    let raw = raw_bytes(dir.path());
    assert!(!contains(&raw, "top-secret-credential"));
    assert!(contains(&raw, "laptop"));
    k.save_passkeys(&[]).unwrap();
    assert!(k.load_passkeys().unwrap().is_empty());
}

/// Locks decision 2: the kit's file has no kind, and the schema carries
/// no table a Storage page could be pointed at by a project's kind (the
/// kit tables are `kit_*`; `DataKind` refuses `chassis_*` and a kind is
/// validated only against the APP file, which has no such tables).
#[test]
fn the_kit_tables_are_not_in_the_app_file_so_no_kind_can_name_them() {
    let dir = tempfile::tempdir().unwrap();
    let _kit = kit(dir.path());
    let app = crate::storage::AppDb::open(
        &dir.path().join("svc.db"),
        crate::storage::AppDbSpec::default(),
        vec![],
    )
    .unwrap();
    for t in ["kit_clients", "kit_sessions", "kit_passkeys"] {
        let err = crate::storage::AppDb::open_in_memory(
            crate::storage::AppDbSpec::default(),
            vec![crate::storage::DataKind::new("x", "X").table(t)],
        )
        .unwrap_err();
        assert!(err.message.contains("no table"), "{t}: {err}");
        let n: i64 = app
            .read_blocking(|c| {
                Ok(c.query_row(
                    "SELECT count(*) FROM sqlite_master WHERE name = ?1",
                    [t],
                    |r| r.get(0),
                )?)
            })
            .unwrap();
        assert_eq!(n, 0, "{t} is not in the app file");
    }
}
