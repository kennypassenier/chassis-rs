//! `chassis new`: the project it writes must pass a `sync` without a difference.

use crate::new_project::cmd_new;
use crate::recorded::KP_THEMES;
use crate::sync::cmd_sync;

#[test]
fn new_writes_a_project_that_syncs_clean() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("demo-svc");
    cmd_new(
        "demo-svc".into(),
        "A demo".into(),
        None,
        Some(target.clone()),
        true,
        None,
        Some("v0.1.0".into()),
        false,
    )
    .unwrap();
    assert!(target.join(".chassis.toml").exists());
    assert!(target.join(".git").exists());
    assert!(
        !target.join(".github").exists(),
        "3.0.0: no workflow is written"
    );
    // K27: `new` writes the kit documentation and `sync` sees it as
    // in sync (the clean-sync assertion below covers the second half).
    assert!(target.join("docs/KIT.md").exists(), "docs/KIT.md written");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert!(
            std::fs::metadata(target.join(".githooks/pre-commit"))
                .unwrap()
                .permissions()
                .mode()
                & 0o111
                != 0
        );
    }
    // Freshly generated: zero diffs.
    assert!(
        !cmd_sync(&target, false, false, false, false)
            .unwrap()
            .changed,
        "no differences right after new"
    );
    // A drifted kit file is reported and --write repairs it.
    std::fs::write(target.join("deny.toml"), "# drifted\n").unwrap();
    assert!(
        cmd_sync(&target, false, false, false, false)
            .unwrap()
            .changed
    );
    assert!(
        cmd_sync(&target, true, false, false, false)
            .unwrap()
            .changed
    );
    assert!(
        !cmd_sync(&target, false, false, false, false)
            .unwrap()
            .changed
    );
    // fix-4: a project-owned file that is GONE is written back — creating
    // is not overwriting, and a missing hook is no gate at all (rule 12).
    // kyu-runner asked the question that found this: a migrated project
    // never runs `new`, so it would have waited forever for check-ids.sh.
    std::fs::remove_file(target.join(".githooks/check-ids.sh")).unwrap();
    assert!(
        cmd_sync(&target, false, false, false, false)
            .unwrap()
            .unresolved,
        "a missing project-owned file is drift, not silence"
    );
    assert!(
        cmd_sync(&target, true, false, false, false)
            .unwrap()
            .changed
    );
    assert!(
        target.join(".githooks/check-ids.sh").exists(),
        "--write puts the missing hook back"
    );
    // ... but one that exists and differs is still left alone.
    std::fs::write(target.join(".githooks/check-ids.sh"), "# mine\n").unwrap();
    assert!(
        !cmd_sync(&target, true, false, false, false)
            .unwrap()
            .changed,
        "a shared hook that is present is never rewritten"
    );
    assert_eq!(
        std::fs::read_to_string(target.join(".githooks/check-ids.sh")).unwrap(),
        "# mine\n"
    );
    // A project-owned file is left alone.
    std::fs::write(target.join("src/main.rs"), "fn main() {}\n").unwrap();
    assert!(
        !cmd_sync(&target, false, false, false, false)
            .unwrap()
            .changed,
        "owned files do not count as drift"
    );
    assert_eq!(
        std::fs::read_to_string(target.join("src/main.rs")).unwrap(),
        "fn main() {}\n"
    );
    // K32: a stale kp_themes record is drift; --write corrects it and
    // keeps the file's header comment. Drilled red once (dropped the
    // `changed |= drifted` line in cmd_sync): failed, restored.
    let chassis_toml = target.join(".chassis.toml");
    let text = std::fs::read_to_string(&chassis_toml).unwrap();
    std::fs::write(&chassis_toml, text.replace(KP_THEMES, "3.0.0")).unwrap();
    assert!(
        cmd_sync(&target, false, false, false, false)
            .unwrap()
            .changed
    );
    assert!(
        cmd_sync(&target, true, false, false, false)
            .unwrap()
            .changed
    );
    assert_eq!(std::fs::read_to_string(&chassis_toml).unwrap(), text);
    assert!(
        !cmd_sync(&target, false, false, false, false)
            .unwrap()
            .changed
    );
    // K32: a Cargo.toml that pins another kit tag is drift --write does not touch.
    let cargo = target.join("Cargo.toml");
    let pinned = std::fs::read_to_string(&cargo).unwrap();
    std::fs::write(
        &cargo,
        pinned.replace("tag = \"v0.1.0\"", "tag = \"v0.0.9\""),
    )
    .unwrap();
    assert!(
        cmd_sync(&target, true, false, false, false)
            .unwrap()
            .changed
    );
    assert!(
        std::fs::read_to_string(&cargo).unwrap().contains("v0.0.9"),
        "Cargo.toml is project-owned"
    );
    // D1 (2026-09-07): a difference --write cannot fix stays unresolved,
    // and that — not "did --write run" — decides the exit code. Drilled
    // red once (unresolved computed as `changed && !write`, the pre-D1
    // rule): failed, restored.
    let after = cmd_sync(&target, true, false, false, false).unwrap();
    assert!(
        after.unresolved,
        "the foreign kit tag is still there after --write"
    );
    let fixed = std::fs::read_to_string(&cargo)
        .unwrap()
        .replace("v0.0.9", "v0.1.0");
    std::fs::write(&cargo, fixed).unwrap();
    assert!(
        !cmd_sync(&target, false, false, false, false)
            .unwrap()
            .unresolved,
        "nothing left once Cargo.toml agrees again"
    );
}
