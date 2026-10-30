//! Tests of the one-time import of the old sealed JSON files.

use super::*;
use crate::storage::db::meta_get;

fn write_legacy(dir: &Path) {
    EncryptedFile::new(dir.join("clients.json.enc"), key(), "clients")
        .save(&clients())
        .unwrap();
    let mut s = SessionsFile::default();
    s.create("one", 1_000, 5_000, false);
    s.create("two", 1_000, 5_000, true);
    EncryptedFile::new(dir.join("sessions.json.enc"), key(), "sessions")
        .save(&s)
        .unwrap();
}

fn plan(dir: &Path) -> ImportPlan {
    ImportPlan {
        state_dir: dir.to_path_buf(),
        clients: true,
        sessions_file: "sessions.json.enc",
        passkeys: false,
    }
}

#[test]
fn the_import_moves_the_old_files_in_verifies_counts_and_renames_them() {
    let dir = tempfile::tempdir().unwrap();
    write_legacy(dir.path());
    let k = kit(dir.path());
    assert_eq!(k.import_legacy(&plan(dir.path())).unwrap(), 2);
    assert_eq!(k.load_clients().unwrap(), clients());
    assert_eq!(k.load_sessions().unwrap().sessions.len(), 2);
    assert!(!dir.path().join("clients.json.enc").exists());
    assert!(dir.path().join("clients.json.enc.migrated").exists());
    assert!(dir.path().join("sessions.json.enc.migrated").exists());
    // The renamed copy is still sealed: it keeps working as a backup.
    assert!(
        EncryptedFile::new(dir.path().join("clients.json.enc.migrated"), key(), "c")
            .load::<ClientsFile>()
            .unwrap()
            .is_some()
    );
}

/// The marker makes the import idempotent: a restored old file cannot
/// overwrite newer data, and a fresh install marks itself done.
#[test]
fn a_second_import_does_nothing_even_if_an_old_file_comes_back() {
    let dir = tempfile::tempdir().unwrap();
    write_legacy(dir.path());
    let k = kit(dir.path());
    k.import_legacy(&plan(dir.path())).unwrap();
    let mut f = k.load_clients().unwrap();
    f.delete("id-1").unwrap();
    k.save_clients(&f).unwrap();
    write_legacy(dir.path()); // an old file restored by hand
    assert_eq!(k.import_legacy(&plan(dir.path())).unwrap(), 0);
    assert_eq!(
        k.load_clients().unwrap().clients.len(),
        1,
        "newer data kept"
    );
    assert!(
        dir.path().join("clients.json.enc").exists(),
        "and nothing renamed"
    );

    // Fresh install: no files, marker set, a file appearing later is ignored.
    let fresh = tempfile::tempdir().unwrap();
    let k = kit(fresh.path());
    assert_eq!(k.import_legacy(&plan(fresh.path())).unwrap(), 0);
    write_legacy(fresh.path());
    assert_eq!(k.import_legacy(&plan(fresh.path())).unwrap(), 0);
    assert!(k.load_clients().unwrap().clients.is_empty());
}

/// A failure anywhere writes NOTHING anywhere: the sessions that were
/// fine are rolled back with the clients that were not, no marker is
/// set, the old files are untouched, and the next try can succeed.
#[test]
fn a_failed_import_writes_nothing_and_keeps_the_old_files() {
    let dir = tempfile::tempdir().unwrap();
    write_legacy(dir.path());
    // Corrupt the clients file: two clients with one id.
    let mut bad = clients();
    bad.clients[1].id = "id-1".into();
    EncryptedFile::new(dir.path().join("clients.json.enc"), key(), "clients")
        .save(&bad)
        .unwrap();
    let before = std::fs::read(dir.path().join("clients.json.enc")).unwrap();
    let k = kit(dir.path());
    let err = k.import_legacy(&plan(dir.path())).unwrap_err();
    assert!(
        err.message.contains("UNIQUE") || err.message.contains("database error"),
        "{err}"
    );
    assert!(
        k.load_clients().unwrap().clients.is_empty(),
        "no client was kept"
    );
    assert!(
        k.load_sessions().unwrap().sessions.is_empty(),
        "nor the sessions that were fine"
    );
    assert!(
        dir.path().join("sessions.json.enc").exists(),
        "no old file was renamed"
    );
    assert_eq!(
        std::fs::read(dir.path().join("clients.json.enc")).unwrap(),
        before,
        "and none was touched"
    );
    let marker =
        k.db.read_blocking(|c| meta_get(c, "import.clients"))
            .unwrap();
    assert!(marker.is_none(), "no marker, so the next start retries");
    // Fixed file, next start: it goes through.
    EncryptedFile::new(dir.path().join("clients.json.enc"), key(), "clients")
        .save(&clients())
        .unwrap();
    assert_eq!(k.import_legacy(&plan(dir.path())).unwrap(), 2);
    assert_eq!(k.load_clients().unwrap(), clients());
}

#[test]
fn an_import_with_the_wrong_key_fails_with_the_rekey_remedy_and_writes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    write_legacy(dir.path());
    let db = Db::open(&dir.path().join("svc-kit.db"), &kit_migrations()).unwrap();
    let wrong = KitDb::new(db, Key::from_bytes([1u8; 32]));
    let err = wrong.import_legacy(&plan(dir.path())).unwrap_err();
    assert!(err.remedy.contains("rekey"), "{err}");
    assert!(dir.path().join("clients.json.enc").exists());
}

#[test]
fn an_open_run_imports_its_own_sessions_file_and_not_the_closed_ones() {
    let dir = tempfile::tempdir().unwrap();
    write_legacy(dir.path());
    let mut open_sessions = SessionsFile::default();
    open_sessions.create("o", 1_000, 5_000, false);
    EncryptedFile::new(dir.path().join("sessions.open.json.enc"), key(), "s")
        .save(&open_sessions)
        .unwrap();
    let k = kit(dir.path());
    let open_plan = ImportPlan {
        state_dir: dir.path().to_path_buf(),
        clients: false,
        sessions_file: "sessions.open.json.enc",
        passkeys: false,
    };
    assert_eq!(k.import_legacy(&open_plan).unwrap(), 1);
    assert_eq!(k.load_sessions().unwrap().sessions.len(), 1);
    assert!(
        dir.path().join("clients.json.enc").exists(),
        "closed files untouched"
    );
}
