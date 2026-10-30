//! Tests of the startup side of an update: probation and revert, the health
//! confirmation and drill marker, the `.prev` link remedy, state files and the
//! `ETXTBSY` probe retry.

use super::staging::{is_text_file_busy, spawn_retrying_busy};
use super::*;

#[tokio::test]
async fn autonomous_writes_state_and_startup_reverts_after_the_attempts() {
    let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
    let dir = tempfile::tempdir().unwrap();
    let old = b"#!/bin/sh\nexit 0\n# old\n";
    let bin = installed(dir.path(), old);
    let (sink, events) = sink();
    let up = Updater::new(
        cfg(&release, Mode::Autonomous, dir.path().join("c")),
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        sink.clone(),
        None,
    )
    .unwrap();
    assert!(matches!(
        up.check_once().await.unwrap(),
        Outcome::Installed { .. }
    ));
    let state = read_state(&up.state_path()).expect("autonomous writes state before the restart");
    assert_eq!(state.to_version, "1.1.0");
    assert_eq!(state.attempts, 0);

    // The NEW binary starts: attempt 1 → probation, keeps serving.
    let new = Updater::new(
        cfg(&release, Mode::Autonomous, dir.path().join("c")),
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.1.0").unwrap(),
        sink.clone(),
        None,
    )
    .unwrap();
    assert!(!new.handle_pending_update().unwrap(), "first start serves");
    assert_eq!(read_state(&new.state_path()).unwrap().attempts, 1);
    // It crashes before confirming; the next start reverts.
    assert!(
        new.handle_pending_update().unwrap(),
        "second start reverts and asks to exit"
    );
    assert!(read_state(&new.state_path()).is_none());
    assert_eq!(
        std::fs::read(&bin).unwrap(),
        old,
        "the previous binary is back"
    );
    assert!(
        events
            .lock()
            .unwrap()
            .iter()
            .any(|e| e.kind == "update.rolled_back")
    );

    // The restored old version starts: nothing pending.
    let restored = Updater::new(
        cfg(&release, Mode::Autonomous, dir.path().join("c")),
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        sink,
        None,
    )
    .unwrap();
    assert!(!restored.handle_pending_update().unwrap());
}

#[tokio::test]
async fn confirm_healthy_clears_probation_and_drill_marker_binds_to_the_version() {
    let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), GOOD_BINARY);
    let mut c = cfg(&release, Mode::Autonomous, dir.path().join("c"));
    c.drill = Some("broken".into());
    let (sink, events) = sink();
    let up = Updater::new(
        c,
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        sink.clone(),
        None,
    )
    .unwrap();
    up.check_once().await.unwrap();
    // The old version does not see the drill; the new one does, once.
    assert_eq!(up.drill_kind(), None);
    let new = Updater::new(
        cfg(&release, Mode::Autonomous, dir.path().join("c")),
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.1.0").unwrap(),
        sink,
        None,
    )
    .unwrap();
    assert_eq!(new.drill_kind().as_deref(), Some("broken"));
    assert_eq!(new.drill_kind(), None, "consumed");
    // Probation → healthy clears the state and reports.
    new.handle_pending_update().unwrap();
    new.confirm_healthy();
    assert!(read_state(&new.state_path()).is_none());
    assert!(events.lock().unwrap().iter().any(|e| e.kind == "update.ok"));
    // With nothing pending, confirm_healthy stays silent.
    let before = events.lock().unwrap().len();
    new.confirm_healthy();
    assert_eq!(events.lock().unwrap().len(), before);
}

#[test]
fn a_refused_prev_link_names_the_owner_and_the_directory() {
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), GOOD_BINARY);
    let remedy = prev_link_remedy(&bin);
    use std::os::unix::fs::MetadataExt;
    let uid = std::fs::metadata(&bin).unwrap().uid();
    assert!(remedy.contains(&format!("uid {uid}:")), "{remedy}");
    assert!(remedy.contains("install -o"), "{remedy}");
    assert!(
        remedy.contains(&dir.path().display().to_string()),
        "{remedy}"
    );
}

#[test]
fn corrupt_state_reads_as_none_and_copies_are_pruned() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("update-state.json");
    std::fs::write(&p, b"{not json").unwrap();
    assert!(read_state(&p).is_none());
    for v in ["1.0.0", "1.1.0", "1.2.0"] {
        std::fs::create_dir_all(dir.path().join("copies").join(v)).unwrap();
        std::thread::sleep(Duration::from_millis(20));
    }
    prune_copies(&dir.path().join("copies"), 2);
    assert!(!dir.path().join("copies/1.0.0").exists());
    assert!(dir.path().join("copies/1.2.0").exists());
}

/// CI 2026-09-06: `ETXTBSY` right after staging — a sibling thread's
/// fork held the descriptor for a moment. The probe retries that and
/// only that; any other error is final.
#[tokio::test]
async fn the_probe_retries_a_text_file_busy_spawn_and_nothing_else() {
    let mut calls = 0;
    let out = spawn_retrying_busy(
        || {
            calls += 1;
            if calls < 3 {
                Err(std::io::Error::from_raw_os_error(26))
            } else {
                Ok("spawned")
            }
        },
        5,
        Duration::from_millis(1),
    )
    .await
    .unwrap();
    assert_eq!((out, calls), ("spawned", 3));

    let mut calls = 0;
    let err = spawn_retrying_busy(
        || {
            calls += 1;
            Err::<(), _>(std::io::Error::from_raw_os_error(26))
        },
        2,
        Duration::from_millis(1),
    )
    .await
    .unwrap_err();
    assert!(
        is_text_file_busy(&err) && calls == 3,
        "gives up after the attempts"
    );

    let mut calls = 0;
    let err = spawn_retrying_busy(
        || {
            calls += 1;
            Err::<(), _>(std::io::Error::from_raw_os_error(2))
        },
        5,
        Duration::from_millis(1),
    )
    .await
    .unwrap_err();
    assert!(
        !is_text_file_busy(&err) && calls == 1,
        "ENOENT is not retried"
    );
}
