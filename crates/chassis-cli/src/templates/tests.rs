//! Tests of what the scaffold ships: the shared hooks, their version stamp, the
//! gate cache and the kit-owned smoke test.

use super::*;

/// fix-4: the three hooks that dev-procedure also owns are project-owned
/// here, so `chassis sync` reports a difference and never writes over a
/// project that carries the canonical version. Two shared sources claiming
/// one file is what made `sync` permanently red in kyu-runner (CF-16).
#[test]
fn fix_4_the_shared_hooks_are_written_once_and_never_synced_back() {
    for path in [
        ".githooks/commit-msg",
        ".githooks/check-ids.sh",
        ".claude/hooks/check-commit.sh",
    ] {
        let entry = ENTRIES
            .iter()
            .find(|e| e.path == path)
            .unwrap_or_else(|| panic!("{path} is not in the scaffold"));
        assert!(
            entry.project_owned,
            "{path} must be project-owned: dev-procedure owns it too"
        );
        assert!(entry.executable, "{path} is a hook and must be executable");
        assert!(!entry.render, "{path} is copied verbatim, not rendered");
    }
}

/// fix-4: a fresh project gets the current hook generation, not the one
/// the scaffold happened to be born with. The stamp is what dev-procedure's
/// sync-hooks.sh reads, and the old copy had none at all.
#[test]
fn fix_4_the_shipped_hooks_carry_the_version_stamp() {
    for path in [
        ".githooks/commit-msg",
        ".githooks/check-ids.sh",
        ".githooks/check-timestamps.sh",
        ".githooks/gate-cache.sh",
        ".claude/hooks/check-commit.sh",
    ] {
        let entry = ENTRIES.iter().find(|e| e.path == path).unwrap();
        assert!(
            entry.body.lines().any(|l| l.starts_with("# HOOK_VERSION=")),
            "{path} carries no HOOK_VERSION stamp"
        );
    }
}

/// fix-11: a fresh project's gates skip the suite when no Rust moved
/// (dev-procedure rule 49), which needs the runner it sources shipped
/// beside it; the scaffold still ran the suite on every commit.
#[test]
fn fix_11_the_gates_use_the_gate_cache_and_ship_it() {
    let gates = ENTRIES
        .iter()
        .find(|e| e.path == ".claude/hooks/gates.sh")
        .unwrap()
        .body;
    for line in [
        ". \"$(git rev-parse --show-toplevel)/.githooks/gate-cache.sh\"",
        "gate_glob suite '*.rs' 'Cargo.toml' 'Cargo.lock' '*/Cargo.toml' -- \\",
        "gate_cache_done",
    ] {
        assert!(gates.contains(line), "gates.sh lacks: {line}");
    }
    for path in [".githooks/gate-cache.sh", ".githooks/trace-inputs.cjs"] {
        let entry = ENTRIES
            .iter()
            .find(|e| e.path == path)
            .unwrap_or_else(|| panic!("{path} is not shipped, gates.sh sources it"));
        assert!(entry.project_owned, "{path} is dev-procedure's too");
    }
}

/// K34: the smoke test is kit-owned, so `chassis sync` rewrites it when
/// the harness changes instead of leaving a project on an old one — the
/// whole point of shipping it. Drilled red once by listing the entry
/// with `owned(...)`: failed on `project_owned`, restored.
#[test]
fn k34_the_kit_smoke_test_is_a_rendered_kit_owned_scaffold_file() {
    let entry = ENTRIES
        .iter()
        .find(|e| e.path == "tests/kit_smoke.rs")
        .expect("the scaffold writes tests/kit_smoke.rs");
    assert!(entry.render, "it carries the project's name and repository");
    assert!(
        !entry.project_owned,
        "a sync must rewrite it, like docs/KIT.md"
    );
    assert!(
        entry.body.contains("chassis::testing::TestApp"),
        "it is built on the kit's harness"
    );
}
