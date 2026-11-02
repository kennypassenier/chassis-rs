//! Tests of the update state in the kit database: it survives a restart
//! (a fresh `Updater` on the same state dir), the old JSON files move in once
//! and are set aside, and a corrupt old file is reported, not trusted.

use super::*;

fn updater(dir: &Path) -> Updater {
    Updater::new(
        UpdateConfig {
            mode: Mode::Autonomous,
            url: String::new(),
            asset_name: "svc".into(),
            interval: Duration::from_secs(3600),
            startup_delay: Duration::from_millis(1),
            healthy_after: Duration::from_millis(1),
            max_start_attempts: 2,
            hold: Hold::None,
            drill: None,
            keep_copies: 2,
            probe_timeout: Duration::from_secs(5),
            download_timeout: Duration::from_secs(5),
            pubkey: RELEASE_PUBKEY.to_string(),
            pubkey_overridden: false,
            repo: None,
            allow_insecure: false,
            max_download_bytes: 1024,
            copies_dir: dir.join("c"),
            gate: None,
            notify_after_failures: 3,
        },
        installed(dir, GOOD_BINARY),
        dir.join("s"),
        Version::parse("1.0.0").unwrap(),
        Arc::new(|_| {}),
        None,
    )
    .unwrap()
}

fn pending() -> UpdateState {
    UpdateState {
        from_version: "0.9.0".into(),
        to_version: "1.0.0".into(),
        previous_binary: "/x/svc.prev".into(),
        attempts: 1,
    }
}

#[test]
fn state_and_skips_survive_a_restart() {
    let dir = tempfile::tempdir().unwrap();
    let first = updater(dir.path());
    first.store().unwrap().set_state(&pending()).unwrap();
    first.remember_skip("1.1.0").unwrap();
    drop(first);
    let second = updater(dir.path());
    assert_eq!(second.pending_state().unwrap(), Some(pending()));
    assert!(second.is_skipped(Version::parse("1.1.0").unwrap()).unwrap());
    assert!(!second.is_skipped(Version::parse("1.2.0").unwrap()).unwrap());
    second.store().unwrap().clear_state().unwrap();
    assert_eq!(updater(dir.path()).pending_state().unwrap(), None);
}

#[test]
fn old_json_files_move_in_once_and_are_set_aside() {
    let dir = tempfile::tempdir().unwrap();
    let s = dir.path().join("s");
    std::fs::create_dir_all(&s).unwrap();
    std::fs::write(
        s.join("update-state.json"),
        serde_json::to_vec(&pending()).unwrap(),
    )
    .unwrap();
    std::fs::write(s.join("update-skip.json"), br#"["1.1.0","1.2.0"]"#).unwrap();
    let up = updater(dir.path());
    assert_eq!(up.pending_state().unwrap(), Some(pending()));
    assert!(up.is_skipped(Version::parse("1.2.0").unwrap()).unwrap());
    assert!(!s.join("update-state.json").exists());
    assert!(!s.join("update-skip.json").exists());
    assert!(s.join("update-state.json.imported").exists());
    assert!(s.join("update-skip.json.imported").exists());
}

#[test]
fn a_corrupt_old_state_file_is_set_aside_not_trusted() {
    let dir = tempfile::tempdir().unwrap();
    let s = dir.path().join("s");
    std::fs::create_dir_all(&s).unwrap();
    std::fs::write(s.join("update-state.json"), b"{not json").unwrap();
    let up = updater(dir.path());
    assert_eq!(up.pending_state().unwrap(), None);
    assert!(s.join("update-state.json.imported").exists());
}

#[test]
fn a_read_creates_no_kit_file() {
    let dir = tempfile::tempdir().unwrap();
    let up = updater(dir.path());
    assert_eq!(up.pending_state().unwrap(), None);
    assert!(!dir.path().join("s").join("svc-kit.db").exists());
}
