//! The key of the push service: made once, read back, sealed, never silently replaced.

use super::*;

fn seal_key(byte: u8) -> Key {
    Key::parse_hex("TEST_KEY", &hex::encode([byte; 32]), "").unwrap()
}

fn store() -> (tempfile::TempDir, PushStore) {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(
        &dir.path().join("svc-kit.db"),
        &crate::storage::kit_migrations(),
    )
    .unwrap();
    (dir, PushStore::new(db, 10))
}

#[test]
fn the_key_is_made_once_and_read_back_on_every_later_start() {
    let (_dir, store) = store();
    let first = load_or_create_key(&store, &seal_key(1)).unwrap();
    let again = load_or_create_key(&store, &seal_key(1)).unwrap();
    assert_eq!(
        first.public_key(),
        again.public_key(),
        "a restart keeps the key"
    );
}

#[test]
fn the_stored_secret_is_sealed_and_only_its_own_key_opens_it() {
    let (_dir, store) = store();
    let key = load_or_create_key(&store, &seal_key(1)).unwrap();
    let row = store.vapid_sealed().unwrap().unwrap();
    assert!(
        row.contains("\"ct\"") || row.contains("ciphertext") || row.contains('{'),
        "an envelope: {row}"
    );
    let public_hex = hex::encode(key.public_key());
    assert!(!row.contains(&public_hex), "no key material in the clear");
    let err = load_or_create_key(&store, &seal_key(2)).unwrap_err();
    assert!(
        !err.message.is_empty(),
        "a different secret key cannot read it"
    );
}

#[test]
fn a_corrupt_row_is_a_config_error_with_a_remedy_not_a_new_key() {
    let (_dir, store) = store();
    store.set_vapid_sealed("not an envelope").unwrap();
    let err = load_or_create_key(&store, &seal_key(1)).unwrap_err();
    assert!(err.remedy.contains("push_vapid_key"), "{}", err.remedy);
    assert_eq!(
        store.vapid_sealed().unwrap().as_deref(),
        Some("not an envelope"),
        "never silently replaced"
    );
}

#[test]
fn push_mounts_only_with_a_login_and_the_kit_file() {
    assert!(will_mount(false, true));
    assert!(
        !will_mount(true, true),
        "open dashboard: no key to seal with"
    );
    assert!(
        !will_mount(false, false),
        "no kit file to keep subscriptions in"
    );
}
