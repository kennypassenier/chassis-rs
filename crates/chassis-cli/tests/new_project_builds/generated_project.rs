//! The generated project itself and the checks on what `chassis new` wrote:
//! the documents, the project's own gates, cargo-deny and the systemd unit.
//! The later phases (sync, release plan, build) are in `generated_commands.rs`.

use std::path::PathBuf;
use std::process::Command;

use super::support::{chassis, in_repo};

/// A project written by `chassis new --chassis-path <this checkout>`.
pub struct Project {
    pub tmp: tempfile::TempDir,
    pub root: PathBuf,
    pub target: PathBuf,
}

impl Project {
    /// Runs `chassis new` into a temp directory and checks what it prints.
    pub fn create() -> Self {
        let kit = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../chassis");
        let target = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target");
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("demo-svc");
        // K34: the tag is the kit's version requirement in the generated
        // Cargo.toml, and the smoke test's dev-dependency points at this same
        // checkout, so a made-up tag would leave cargo with a requirement no
        // local crate satisfies. The kit's crates carry the CLI's version —
        // `with_chassis_path` writes that same one on the path dependency.
        let local_tag = format!("v{}", env!("CARGO_PKG_VERSION"));

        let out = chassis()
            .args([
                "new",
                "demo-svc",
                "--no-remote",
                "--description",
                "A demo service for the kit's own test",
                "--dir",
                root.to_str().unwrap(),
                "--chassis-path",
                kit.to_str().unwrap(),
                "--chassis-tag",
                local_tag.as_str(),
            ])
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "chassis new failed: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(stdout.contains("first commit"), "{stdout}");
        assert!(
            stdout.contains("--no-remote"),
            "tells how to create the remote later"
        );
        Self { tmp, root, target }
    }
}

/// K27 and K34: the written documents. Returns the smoke test's text, which a
/// later phase compares against what `sync --write` restores.
pub fn written_documents(p: &Project) -> String {
    // K27: the kit documentation is part of the scaffold and names the
    // project's admin token variable. Drilled red once by removing the
    // scaffold entry, so `new` wrote no KIT.md.
    let kit_md = std::fs::read_to_string(p.root.join("docs/KIT.md"))
        .expect("docs/KIT.md is written by chassis new");
    assert!(kit_md.contains("DEMO_SVC_TOKEN"), "{kit_md}");
    assert!(kit_md.contains("| `DEMO_SVC_LISTEN` |"), "{kit_md}");

    // K34: every new project ships the kit's smoke test, and its Cargo.toml
    // gives the harness to the tests without putting it in the binary.
    // Drilled red once by dropping the scaffold entry: `new` wrote no
    // tests/kit_smoke.rs.
    let smoke = std::fs::read_to_string(p.root.join("tests/kit_smoke.rs"))
        .expect("tests/kit_smoke.rs is written by chassis new");
    assert!(smoke.contains("chassis::testing::TestApp"), "{smoke}");
    let cargo_toml_text = std::fs::read_to_string(p.root.join("Cargo.toml")).unwrap();
    let (_, dev) = cargo_toml_text
        .split_once("[dev-dependencies]")
        .expect("the scaffold has a dev-dependencies section");
    assert!(
        dev.contains(r#"features = ["testing"]"#),
        "the harness comes in as a dev-dependency: {dev}"
    );
    smoke
}

/// H10: the generated project passes ITS OWN gates (fmt, clippy -D
/// warnings, tests, clean tree) — what its first real commit will face.
pub fn passes_its_own_gates(p: &Project) {
    let gates = p.root.join(".claude/hooks/gates.sh");
    assert!(gates.exists(), "gates.sh is part of the scaffold");
    let out = in_repo("bash", &p.root)
        .arg(&gates)
        // Since the gate cache defers test suites to the release, this test
        // asks for them: it exists to prove the smoke test runs and is green.
        .env("GATE_TESTS", "1")
        .env("CARGO_TARGET_DIR", &p.target)
        .output()
        .unwrap();
    let gates_out = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(
        out.status.success(),
        "the generated project's gates failed:\n{gates_out}"
    );
    // K34: the gates RAN the smoke test and it was green — a scaffold that
    // ships a test nobody runs proves nothing. Drilled red once by asserting
    // on a misspelt test name: failed, restored.
    assert!(
        gates_out.contains("test kit_smoke_login_client_token_api_call_and_dashboard ... ok"),
        "the project's own `cargo test` ran the kit smoke test:\n{gates_out}"
    );
}

/// CF-6 (2026-09-06): the generated project must also pass cargo-deny.
/// The first remote project was red on it (a git dependency without a
/// version requirement) while every local gate above was green; the
/// gate that predicts the release has to run what the release runs.
/// Runs when cargo-deny is installed (`chassis release` requires it) and
/// says so loudly otherwise.
pub fn passes_cargo_deny(p: &Project) {
    let deny_available = Command::new("cargo")
        .args(["deny", "--version"])
        .output()
        .is_ok_and(|o| o.status.success());
    if deny_available {
        let out = Command::new("cargo")
            .args(["deny", "check"])
            .current_dir(&p.root)
            .env("CARGO_TARGET_DIR", &p.target)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "the generated project fails cargo-deny:\n{}\n{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        );
    } else {
        eprintln!(
            "new_project_builds: cargo-deny is not installed — the cargo-deny check on the generated project was SKIPPED (install it: cargo install cargo-deny --locked)"
        );
    }
}

/// H10: the rendered systemd units parse (systemd-analyze, when present).
pub fn systemd_unit_parses(p: &Project) {
    if let Ok(analyze) = Command::new("systemd-analyze")
        .args([
            "verify",
            p.root.join("deploy/demo-svc.service").to_str().unwrap(),
        ])
        .output()
    {
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&analyze.stdout),
            String::from_utf8_lossy(&analyze.stderr)
        );
        for line in text.lines().filter(|l| !l.trim().is_empty()) {
            assert!(
                line.contains("is not executable") || line.contains("No such file"),
                "systemd-analyze verify complains about the unit itself: {line}"
            );
        }
    }
}
