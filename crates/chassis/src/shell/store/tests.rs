//! Unit tests for `store`; kept in their own file so the module stays small.

use super::*;

fn key() -> Key {
    Key::from_bytes([3u8; 32])
}

#[test]
fn encrypted_file_round_trips_and_is_unreadable_as_plaintext() {
    let dir = tempfile::tempdir().unwrap();
    let f = EncryptedFile::new(dir.path().join("clients.json.enc"), key(), "clients");
    assert!(f.load::<ClientsFile>().unwrap().is_none());
    let mut c = ClientsFile::default();
    c.issue_with_fields(
        "ha",
        "id".into(),
        "very-secret-token".into(),
        "2026-09-05T07:00:00Z",
        Default::default(),
    )
    .unwrap();
    f.save(&c).unwrap();
    let raw = std::fs::read_to_string(f.path()).unwrap();
    assert!(
        !raw.contains("very-secret-token"),
        "plaintext must never touch disk"
    );
    assert!(raw.contains("\"v\": 1"));
    let back: ClientsFile = f.load().unwrap().unwrap();
    assert_eq!(back, c);
    // No temp file left behind.
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn wrong_key_is_a_config_error_naming_rekey() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.enc");
    EncryptedFile::new(path.clone(), key(), "s")
        .save(&ClientsFile::default())
        .unwrap();
    let err = EncryptedFile::new(path, Key::from_bytes([4u8; 32]), "s")
        .load::<ClientsFile>()
        .unwrap_err();
    assert!(err.remedy.contains("rekey"));
}

/// H11 (rule 12): a missing state dir is refused by --check, created at
/// start; an unwritable one is refused by both with the chown remedy; a
/// failed write flips the built-in store subsystem to failing until a
/// write succeeds again.
#[test]
fn state_dir_probe_fails_closed_and_the_store_subsystem_follows_writes() {
    use crate::shell::health::Subsystem;
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("fresh");
    let err = probe_state_dir(&missing, false).unwrap_err();
    assert!(err.message.contains("does not exist"), "{}", err.message);
    assert!(!missing.exists(), "--check creates nothing");
    probe_state_dir(&missing, true).unwrap();
    assert!(missing.is_dir(), "start creates the state root");
    assert!(
        !missing.join(".chassis-probe").exists(),
        "the probe is removed"
    );
    assert!(StoreSubsystem.check().ok);

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let ro = dir.path().join("ro");
        std::fs::create_dir(&ro).unwrap();
        std::fs::set_permissions(&ro, std::fs::Permissions::from_mode(0o555)).unwrap();
        if std::fs::write(ro.join("x"), b"").is_ok() {
            // Running as root: the permission bits do not bind; nothing to prove here.
            return;
        }
        let err = probe_state_dir(&ro, true).unwrap_err();
        assert!(err.message.contains("not writable"), "{}", err.message);
        assert!(err.remedy.contains("chown"), "{}", err.remedy);
        let status = StoreSubsystem.check();
        assert!(!status.ok, "a failed write shows in /healthz");
        assert!(status.detail.contains("last write failed"));
        // A successful write elsewhere does NOT clear it (1.5.1): the
        // broken directory is still broken.
        write_atomic(&dir.path().join("ok.json"), b"{}", "test").unwrap();
        assert!(
            !StoreSubsystem.check().ok,
            "another path's success is not a cure"
        );
        // A successful write to the same path does.
        std::fs::set_permissions(&ro, std::fs::Permissions::from_mode(0o755)).unwrap();
        probe_state_dir(&ro, true).unwrap();
        assert!(StoreSubsystem.check().ok);
    }
}

/// K8 / critic #11: rotating the secret key re-seals every store; a
/// rerun touches nothing; the wrong old key is refused with a remedy.
#[test]
fn rekey_reseals_every_store_once_and_refuses_a_wrong_old_key() {
    let dir = tempfile::tempdir().unwrap();
    let old = Key::from_bytes([7u8; 32]);
    let new = Key::from_bytes([9u8; 32]);
    for name in ["clients.json.enc", "sessions.json.enc"] {
        EncryptedFile::new(dir.path().join(name), old.clone(), "s")
            .save(&serde_json::json!({"v": name}))
            .unwrap();
    }
    std::fs::write(dir.path().join("update-state.json"), b"{}").unwrap();
    assert_eq!(rekey_dir(dir.path(), &old, &new).unwrap(), 2);
    for name in ["clients.json.enc", "sessions.json.enc"] {
        let v: serde_json::Value = EncryptedFile::new(dir.path().join(name), new.clone(), "s")
            .load()
            .unwrap()
            .unwrap();
        assert_eq!(v["v"], name);
        assert!(
            EncryptedFile::new(dir.path().join(name), old.clone(), "s")
                .load::<serde_json::Value>()
                .is_err(),
            "the old key no longer opens {name}"
        );
    }
    assert_eq!(
        rekey_dir(dir.path(), &old, &new).unwrap(),
        0,
        "rerun is a no-op"
    );
    let wrong = Key::from_bytes([1u8; 32]);
    let err = rekey_dir(dir.path(), &wrong, &Key::from_bytes([2u8; 32])).unwrap_err();
    assert!(err.remedy.contains("OLD_SECRET_KEY"), "{}", err.remedy);
}

// Rule 7g: one suite, every implementation.
fn drive(store: &dyn ClientStore) {
    let now = "2026-09-05T07:00:00Z";
    let c = store
        .update(&mut |f| {
            f.issue_with_fields("ha", "id-1".into(), "tok".into(), now, Default::default())
                .cloned()
        })
        .unwrap();
    assert_eq!(c.name, "ha");
    assert!(store.snapshot().by_token("tok").is_some());
    // A failing change persists nothing.
    let err = store
        .update(&mut |f| {
            f.issue_with_fields("ha", "id-2".into(), "tok2".into(), now, Default::default())
                .cloned()
        })
        .unwrap_err();
    assert!(err.message.contains("already"));
    assert_eq!(store.snapshot().clients.len(), 1);
    store.touch("id-1", now);
    assert_eq!(store.snapshot().get("id-1").unwrap().uses, 1);
    store.persist().unwrap();
    store
        .update(&mut |f| f.revoke("id-1", now).cloned())
        .unwrap();
    assert!(store.snapshot().by_token("tok").is_none());
}

#[test]
fn file_and_memory_stores_pass_the_same_suite() {
    let dir = tempfile::tempdir().unwrap();
    let file = EncryptedFile::new(dir.path().join("clients.json.enc"), key(), "clients");
    let store = FileClientStore::open(file.clone()).unwrap();
    drive(&store);
    // Reopen: the revoke survived, the touch was persisted.
    let reopened = FileClientStore::open(file).unwrap();
    let snap = reopened.snapshot();
    assert!(snap.get("id-1").unwrap().revoked_at.is_some());
    assert_eq!(snap.get("id-1").unwrap().uses, 1);

    drive(&MemoryClientStore::default());
}

/// Rule 7g again: the kit-database implementation passes the very same
/// suite and its changes survive a reopen.
#[cfg(feature = "dashboard")]
#[test]
fn the_database_store_passes_the_same_suite() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("svc-kit.db");
    let open = || {
        crate::storage::KitDb::new(
            crate::storage::Db::open(&path, &crate::storage::kit_migrations()).unwrap(),
            key(),
        )
    };
    let store = DbClientStore::open(open()).unwrap();
    drive(&store);
    let reopened = DbClientStore::open(open()).unwrap();
    let snap = reopened.snapshot();
    assert!(snap.get("id-1").unwrap().revoked_at.is_some());
    assert_eq!(snap.get("id-1").unwrap().uses, 1);
}
