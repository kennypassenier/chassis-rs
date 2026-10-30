//! Tests of re-sealing every field from an old key to a new one.

use super::*;

#[test]
fn rekey_reseals_every_field_once_and_a_wrong_old_key_changes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("svc-kit.db");
    let k = kit(dir.path());
    k.save_clients(&clients()).unwrap();
    k.save_passkeys(&[PasskeyRow {
        id: "p".into(),
        label: "l".into(),
        created_at: "t".into(),
        last_used_at: None,
        credential_json: "{}".into(),
    }])
    .unwrap();
    drop(k);
    let new = Key::from_bytes([8u8; 32]);
    // Wrong old key: refused, nothing changed.
    let err = KitDb::rekey(&path, &Key::from_bytes([2u8; 32]), &new).unwrap_err();
    assert!(err.remedy.contains("OLD_SECRET_KEY"), "{err}");
    assert_eq!(
        kit(dir.path()).load_clients().unwrap(),
        clients(),
        "still readable with the old key"
    );
    // Right old key: token (1) + fields (1) + credential (1).
    assert_eq!(KitDb::rekey(&path, &key(), &new).unwrap(), 3);
    let db = Db::open(&path, &kit_migrations()).unwrap();
    let moved = KitDb::new(db.clone(), new);
    assert_eq!(moved.load_clients().unwrap(), clients());
    assert_eq!(moved.load_passkeys().unwrap().len(), 1);
    assert!(
        KitDb::new(db, key()).load_clients().is_err(),
        "the old key no longer opens it"
    );
    assert_eq!(
        KitDb::rekey(&path, &key(), &Key::from_bytes([8u8; 32])).unwrap(),
        0,
        "a rerun is a no-op"
    );
}
