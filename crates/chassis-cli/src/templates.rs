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
    /// Written once by `new`; `sync` reports but never overwrites without `--force`.
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
        ".githooks/pre-commit",
        include_str!("../../../scaffold/.githooks/pre-commit"),
        true,
    ),
    verbatim(
        ".githooks/commit-msg",
        include_str!("../../../scaffold/.githooks/commit-msg"),
        true,
    ),
    verbatim(
        ".claude/hooks/gates.sh",
        include_str!("../../../scaffold/.claude/hooks/gates.sh"),
        true,
    ),
    verbatim(
        ".claude/hooks/check-commit.sh",
        include_str!("../../../scaffold/.claude/hooks/check-commit.sh"),
        true,
    ),
    verbatim(
        ".claude/settings.json",
        include_str!("../../../scaffold/.claude/settings.json"),
        false,
    ),
];
