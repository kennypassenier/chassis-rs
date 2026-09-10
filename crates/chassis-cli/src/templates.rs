//! The scaffold, embedded (K23, AR14). Each entry says where the file
//! lands in a project, whether it is rendered as a minijinja template or
//! copied verbatim, whether it is executable, and whether the project owns
//! it after `new` (so `sync` leaves it alone).
//!
//! Rendered files carry `{{ name }}`-style variables; verbatim files are
//! scripts whose own braces would confuse a template engine. The list is
//! explicit on purpose: a directory walk at build time would need a build
//! script, and this way the compiler tells you when a file moved.

/// One scaffold file.
pub struct Entry {
    /// Destination path relative to the project root.
    pub path: &'static str,
    pub body: &'static str,
    pub render: bool,
    pub executable: bool,
    /// Written once by `new`; `sync` reports but never overwrites without
    /// `--force`. An absent file is still written, because creating is not
    /// overwriting — that is how a migrated project, which never ran `new`,
    /// receives a shared hook at all (fix-4).
    pub project_owned: bool,
}

const fn rendered(path: &'static str, body: &'static str) -> Entry {
    Entry {
        path,
        body,
        render: true,
        executable: false,
        project_owned: false,
    }
}

const fn verbatim(path: &'static str, body: &'static str, executable: bool) -> Entry {
    Entry {
        path,
        body,
        render: false,
        executable,
        project_owned: false,
    }
}

/// A hook `~/Projects/dev-procedure` also distributes (fix-4). The kit writes
/// it once so a fresh project starts with gates, and never again: two shared
/// sources rewriting one file means every project restores it by hand after
/// every sync, which is what CF-16 found in kyu-runner.
const fn shared_hook(path: &'static str, body: &'static str) -> Entry {
    Entry {
        path,
        body,
        render: false,
        executable: true,
        project_owned: true,
    }
}

const fn owned(path: &'static str, body: &'static str) -> Entry {
    Entry {
        path,
        body,
        render: true,
        executable: false,
        project_owned: true,
    }
}

pub const ENTRIES: &[Entry] = &[
    // Project-owned after creation.
    owned(
        "Cargo.toml",
        include_str!("../../../scaffold/Cargo.toml.tmpl"),
    ),
    owned(
        "src/main.rs",
        include_str!("../../../scaffold/src/main.rs.tmpl"),
    ),
    owned(
        "README.md",
        include_str!("../../../scaffold/README.md.tmpl"),
    ),
    owned(
        "CHANGELOG.md",
        include_str!("../../../scaffold/CHANGELOG.md.tmpl"),
    ),
    // The kit's contract (H3): sync shows the diff.
    rendered(
        "rust-toolchain.toml",
        include_str!("../../../scaffold/rust-toolchain.toml"),
    ),
    rendered("deny.toml", include_str!("../../../scaffold/deny.toml")),
    // K27: what the project gets from the kit, for the kit version it pins;
    // kit-owned so a sync rewrites it, unlike the rest of docs/.
    rendered(
        "docs/KIT.md",
        include_str!("../../../scaffold/docs/KIT.md.tmpl"),
    ),
    // K34: the kit's own smoke test. Kit-owned like docs/KIT.md, so a sync
    // rewrites it when the harness changes; a project's own tests live in
    // other files under tests/.
    rendered(
        "tests/kit_smoke.rs",
        include_str!("../../../scaffold/tests/kit_smoke.rs.tmpl"),
    ),
    rendered(
        ".github/workflows/ci.yml",
        include_str!("../../../scaffold/.github/workflows/ci.yml"),
    ),
    rendered(
        ".github/workflows/release.yml",
        include_str!("../../../scaffold/.github/workflows/release.yml"),
    ),
    rendered("Dockerfile", include_str!("../../../scaffold/Dockerfile")),
    rendered(
        "deploy/{{ name }}.service",
        include_str!("../../../scaffold/deploy/service.tmpl"),
    ),
    rendered(
        "deploy/{{ name }}-latch.service",
        include_str!("../../../scaffold/deploy/service-latch.tmpl"),
    ),
    rendered(
        "deploy/service.yml",
        include_str!("../../../scaffold/deploy/service.yml.tmpl"),
    ),
    Entry {
        path: "scripts/sign-release.sh",
        body: include_str!("../../../scaffold/scripts/sign-release.sh"),
        render: true,
        executable: true,
        project_owned: false,
    },
    verbatim(
        ".gitignore",
        include_str!("../../../scaffold/.gitignore"),
        false,
    ),
    verbatim(
        ".dockerignore",
        include_str!("../../../scaffold/.dockerignore"),
        false,
    ),
    verbatim(
        "deploy/journald.conf",
        include_str!("../../../scaffold/deploy/journald.conf"),
        false,
    ),
    rendered(
        "deploy/compose.example.yml",
        include_str!("../../../scaffold/deploy/compose.example.yml"),
    ),
    verbatim(
        ".githooks/pre-commit",
        include_str!("../../../scaffold/.githooks/pre-commit"),
        true,
    ),
    shared_hook(
        ".githooks/commit-msg",
        include_str!("../../../scaffold/.githooks/commit-msg"),
    ),
    shared_hook(
        ".githooks/check-ids.sh",
        include_str!("../../../scaffold/.githooks/check-ids.sh"),
    ),
    verbatim(
        ".claude/hooks/gates.sh",
        include_str!("../../../scaffold/.claude/hooks/gates.sh"),
        true,
    ),
    shared_hook(
        ".claude/hooks/check-commit.sh",
        include_str!("../../../scaffold/.claude/hooks/check-commit.sh"),
    ),
    verbatim(
        ".claude/settings.json",
        include_str!("../../../scaffold/.claude/settings.json"),
        false,
    ),
];

#[cfg(test)]
mod tests {
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
            ".claude/hooks/check-commit.sh",
        ] {
            let entry = ENTRIES.iter().find(|e| e.path == path).unwrap();
            assert!(
                entry.body.lines().any(|l| l.starts_with("# HOOK_VERSION=")),
                "{path} carries no HOOK_VERSION stamp"
            );
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
}
