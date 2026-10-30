//! `chassis sync`: unit directives it must not drop, obsolete workflows it removes,
//! `.gitignore` additions it keeps and the obsolete `required_checks` it reports.

use super::rec;
use crate::drift;
use crate::new_project::cmd_new;
use crate::recorded::Recorded;
use crate::render::{GITIGNORE_MARKER, dropped_unit_directives, merge_gitignore};
use crate::sync::cmd_sync;

/// fix-14: a directive the project added to its unit survives
/// `sync --write` once it is recorded, and until then --write leaves the
/// unit alone instead of dropping it (http-switchboard's ExecReload,
/// removed by 3.0.0's sync).
#[test]
fn a_projects_own_unit_directive_is_never_dropped_by_sync() {
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
    let unit_path = target.join("deploy/demo-svc.service");
    let reload = "ExecReload=/bin/kill -HUP $MAINPID";
    let unit = std::fs::read_to_string(&unit_path).unwrap();
    let edited = unit.replacen("Restart=always", &format!("{reload}\nRestart=always"), 1);
    std::fs::write(&unit_path, &edited).unwrap();

    // Not recorded yet: --write refuses this file and keeps the line.
    let out = cmd_sync(&target, true, false, false, false).unwrap();
    assert!(out.unresolved, "the refusal is drift that is still there");
    assert!(
        std::fs::read_to_string(&unit_path)
            .unwrap()
            .contains(reload)
    );

    // Recorded: the kit renders it, and the project is in sync.
    let toml_path = target.join(".chassis.toml");
    let toml = std::fs::read_to_string(&toml_path).unwrap();
    std::fs::write(&toml_path, format!("{toml}unit_service = [\"{reload}\"]\n")).unwrap();
    cmd_sync(&target, true, false, false, false).unwrap();
    let after = std::fs::read_to_string(&unit_path).unwrap();
    assert!(after.contains(reload), "{after}");
    assert!(
        !cmd_sync(&target, false, false, false, false)
            .unwrap()
            .changed,
        "recorded and rendered: nothing left to report"
    );
    // --force still means what it says.
    std::fs::write(&toml_path, &toml).unwrap();
    cmd_sync(&target, true, true, false, false).unwrap();
    assert!(
        !std::fs::read_to_string(&unit_path)
            .unwrap()
            .contains(reload)
    );
}

#[test]
fn dropped_directives_are_lines_not_comments_or_sections() {
    let current = "[Service]\n# a note\nExecStart=/x\nExecReload=/bin/kill -HUP $MAINPID\n";
    let rendered = "[Service]\nExecStart=/x\n";
    assert_eq!(
        dropped_unit_directives(current, rendered),
        ["ExecReload=/bin/kill -HUP $MAINPID"]
    );
}

/// 3.0.0: a project made by an older kit carries both workflows; `sync`
/// reports them (exit 1), `sync --write` removes them and the emptied
/// directories, and leaves a project's own workflow alone.
// Drilled red once (skipped the remove_file): the workflows stayed,
// failed, restored.
#[test]
fn sync_write_removes_the_obsolete_workflows() {
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
    let wf = target.join(".github/workflows");
    std::fs::create_dir_all(&wf).unwrap();
    std::fs::write(wf.join("ci.yml"), "name: CI\n").unwrap();
    std::fs::write(wf.join("release.yml"), "name: Release\n").unwrap();
    let outcome = cmd_sync(&target, false, false, false, false).unwrap();
    assert!(outcome.unresolved, "an obsolete workflow is drift");
    assert!(wf.join("ci.yml").exists(), "a plain sync writes nothing");

    std::fs::write(wf.join("audit.yml"), "name: Audit\n").unwrap();
    let outcome = cmd_sync(&target, true, false, false, false).unwrap();
    assert!(!outcome.unresolved);
    assert!(!wf.join("ci.yml").exists() && !wf.join("release.yml").exists());
    assert!(
        wf.join("audit.yml").exists(),
        "a project's own workflow is not the kit's to remove"
    );
    std::fs::remove_file(wf.join("audit.yml")).unwrap();
    std::fs::write(wf.join("ci.yml"), "name: CI\n").unwrap();
    cmd_sync(&target, true, false, false, false).unwrap();
    assert!(
        !target.join(".github").exists(),
        "an emptied .github goes with its last workflow"
    );
    assert!(
        !cmd_sync(&target, false, false, false, false)
            .unwrap()
            .unresolved
    );
}

/// M3: project entries under the marker survive a sync.
#[test]
fn gitignore_additions_under_the_marker_survive_a_sync() {
    let scaffold = format!("/target/\n\n{GITIGNORE_MARKER}\n");
    let current = format!("/old/\n{GITIGNORE_MARKER}\n/almanac\n/cal-stacean\n");
    let merged = merge_gitignore(&scaffold, &current);
    assert_eq!(
        merged,
        format!("/target/\n\n{GITIGNORE_MARKER}\n/almanac\n/cal-stacean\n")
    );
    assert_eq!(
        merge_gitignore(&scaffold, "/old/\n"),
        scaffold,
        "no marker: the scaffold wins"
    );
    assert_eq!(
        merge_gitignore(&scaffold, &scaffold),
        scaffold,
        "an empty tail adds nothing"
    );
}

/// 3.0.0: `required_checks` is obsolete but an old record still parses,
/// and `sync` reports it until the line is deleted.
#[test]
fn an_old_required_checks_line_parses_and_is_reported() {
    let parsed: Recorded = toml::from_str(&format!(
        "{}\nrequired_checks = [\"fmt · clippy · tests\"]\n",
        toml::to_string_pretty(&rec()).unwrap()
    ))
    .unwrap();
    assert_eq!(parsed.required_checks, ["fmt · clippy · tests"]);
    assert!(drift::required_checks_drift(&parsed.required_checks).is_some());
    assert!(drift::required_checks_drift(&rec().required_checks).is_none());
}
