//! Tests of the install pipeline: a supervised and an autonomous update, a
//! failing self-check, holds and pending state, and a rolled-back version.

use super::*;

#[tokio::test]
async fn supervised_update_swaps_and_a_second_run_touches_nothing() {
    let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), b"#!/bin/sh\nexit 0\n# old\n");
    let (sink, events) = sink();
    let copies = Arc::new(AtomicUsize::new(0));
    let c2 = copies.clone();
    let copy: StateCopy = Arc::new(move |dest: &Path| {
        std::fs::write(dest.join("copy.txt"), "state").unwrap();
        c2.fetch_add(1, Ordering::SeqCst);
        Ok(())
    });
    let up = Updater::new(
        cfg(&release, Mode::Supervised, dir.path().join("copies")),
        bin.clone(),
        dir.path().join("state"),
        Version::parse("1.0.0").unwrap(),
        sink,
        Some(copy),
    )
    .unwrap();
    let out = up.check_once().await.unwrap();
    assert_eq!(
        out,
        Outcome::Installed {
            from: Version::parse("1.0.0").unwrap(),
            to: Version::parse("1.1.0").unwrap()
        }
    );
    assert_eq!(
        std::fs::read(&bin).unwrap(),
        GOOD_BINARY,
        "the new binary is in place"
    );
    assert!(
        std::fs::read(with_suffix(&bin, ".prev"))
            .unwrap()
            .ends_with(b"# old\n"),
        "bin.prev is the old one"
    );
    assert!(!with_suffix(&bin, ".staging").exists());
    assert!(!up.state_path().exists(), "supervised writes no state");
    assert_eq!(
        copies.load(Ordering::SeqCst),
        1,
        "state copy taken before the swap (K21)"
    );
    assert!(
        dir.path()
            .join("copies")
            .join("1.1.0")
            .join("copy.txt")
            .exists()
    );
    assert_eq!(events.lock().unwrap()[0].kind, "update.installed");

    // Already current: nothing touched, exit-0 semantics (Outcome::Current).
    let up2 = Updater::new(
        cfg(&release, Mode::Supervised, dir.path().join("copies")),
        bin.clone(),
        dir.path().join("state"),
        Version::parse("1.1.0").unwrap(),
        Arc::new(|_| {}),
        None,
    )
    .unwrap();
    let before = std::fs::metadata(&bin).unwrap().modified().unwrap();
    assert_eq!(
        up2.check_once().await.unwrap(),
        Outcome::Current {
            latest: Version::parse("1.1.0").unwrap()
        }
    );
    assert_eq!(std::fs::metadata(&bin).unwrap().modified().unwrap(), before);
    assert_eq!(up2.last_check().latest.as_deref(), Some("1.1.0"));
    drop(release.dir);
}

#[tokio::test]
async fn a_release_that_fails_its_own_check_is_never_installed() {
    let release = fake_release("1.1.0", BAD_BINARY, "svc").await;
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), GOOD_BINARY);
    let up = Updater::new(
        cfg(&release, Mode::Supervised, dir.path().join("c")),
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        Arc::new(|_| {}),
        None,
    )
    .unwrap();
    let err = up.check_once().await.unwrap_err();
    assert!(
        err.message.contains("refuses its own --check"),
        "{}",
        err.message
    );
    assert!(
        err.message.contains("config broken"),
        "the staged binary's stderr is quoted"
    );
    assert_eq!(std::fs::read(&bin).unwrap(), GOOD_BINARY, "untouched");
    assert!(
        !with_suffix(&bin, ".staging").exists(),
        "staging cleaned up"
    );
    assert!(up.last_check().error.is_some());
}

#[tokio::test]
async fn hold_and_pending_state_block_an_install() {
    let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
    let dir = tempfile::tempdir().unwrap();
    let bin = installed(dir.path(), GOOD_BINARY);
    let mut c = cfg(&release, Mode::Autonomous, dir.path().join("c"));
    c.hold = Hold::Skip(Version::parse("1.1.0").unwrap());
    let (sink, events) = sink();
    let up = Updater::new(
        c,
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        sink,
        None,
    )
    .unwrap();
    assert!(matches!(
        up.check_once().await.unwrap(),
        Outcome::Held { .. }
    ));
    assert_eq!(events.lock().unwrap()[0].kind, "update.held");

    // A pending, unproven update blocks the next one (critic #1).
    let up = Updater::new(
        cfg(&release, Mode::Autonomous, dir.path().join("c")),
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        Arc::new(|_| {}),
        None,
    )
    .unwrap();
    std::fs::create_dir_all(dir.path().join("s")).unwrap();
    write_state(
        &up.state_path(),
        &UpdateState {
            from_version: "0.9.0".into(),
            to_version: "1.0.0".into(),
            previous_binary: "x".into(),
            attempts: 1,
        },
    )
    .unwrap();
    assert!(matches!(
        up.check_once().await.unwrap(),
        Outcome::Blocked { .. }
    ));
}

/// CF-3, live drill 2026-09-05 on CT 118: after a rollback the SAME
/// version must not be installed again by the next check — the churn
/// was install → crash → revert → install, every twenty seconds.
#[tokio::test]
async fn a_rolled_back_version_is_never_reinstalled() {
    let release = fake_release("1.1.0", GOOD_BINARY, "svc").await;
    let dir = tempfile::tempdir().unwrap();
    let old = b"#!/bin/sh\nexit 0\n# old\n";
    let bin = installed(dir.path(), old);
    let (sink, events) = sink();
    let mk = |running: &str| {
        Updater::new(
            cfg(&release, Mode::Autonomous, dir.path().join("c")),
            bin.clone(),
            dir.path().join("s"),
            Version::parse(running).unwrap(),
            sink.clone(),
            None,
        )
        .unwrap()
    };
    assert!(matches!(
        mk("1.0.0").check_once().await.unwrap(),
        Outcome::Installed { .. }
    ));
    let new = mk("1.1.0");
    assert!(!new.handle_pending_update().unwrap(), "probation");
    assert!(new.handle_pending_update().unwrap(), "second start reverts");
    assert_eq!(std::fs::read(&bin).unwrap(), old, "1.0.0 is back");
    // The restored 1.0.0 checks again: 1.1.0 is still the latest release.
    let restored = mk("1.0.0");
    assert!(!restored.handle_pending_update().unwrap());
    let out = restored.check_once().await.unwrap();
    assert!(
        matches!(out, Outcome::Held { .. }),
        "skipped, not reinstalled: {out:?}"
    );
    assert_eq!(std::fs::read(&bin).unwrap(), old, "binary untouched");
    assert!(
        events
            .lock()
            .unwrap()
            .iter()
            .any(|e| e.kind == "update.held" && e.detail.contains("rolled back"))
    );
    assert!(restored.watch_once().await.is_ok());
    assert!(restored.last_check().outcome.unwrap().contains("skipped"));
    // A NEWER release (its own signed fake server) is installed normally.
    let newer = fake_release("1.2.0", GOOD_BINARY, "svc").await;
    let up = Updater::new(
        cfg(&newer, Mode::Autonomous, dir.path().join("c")),
        bin.clone(),
        dir.path().join("s"),
        Version::parse("1.0.0").unwrap(),
        Arc::new(|_| {}),
        None,
    )
    .unwrap();
    assert!(matches!(
        up.check_once().await.unwrap(),
        Outcome::Installed { .. }
    ));
}
