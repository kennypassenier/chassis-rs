//! What `.chassis.toml` fields reach the rendered files: the measured env file,
//! the latch environment and the cargo-deny ignores.

use super::rec;
use crate::recorded::scaffold_features;
use crate::render::render_all;

/// M2: a migrated project records the paths it was measured at and the
/// deploy files render them — CT 112's layout, byte for byte.
#[test]
fn measured_env_file_and_latch_env_reach_the_deploy_files() {
    let mut r = rec();
    r.latch = true;
    r.env_file = Some("/appdata/demo-svc/demo-svc-config/latch.env".into());
    r.latch_env = Some(String::new());
    let files = render_all(&r, &scaffold_features()).unwrap();
    let unit = &files
        .iter()
        .find(|(p, ..)| p == "deploy/demo-svc-latch.service")
        .unwrap()
        .1;
    assert!(
        unit.contains("EnvironmentFile=/appdata/demo-svc/demo-svc-config/latch.env"),
        "{unit}"
    );
    assert!(
        unit.contains("ExecStart=/usr/local/bin/latch run -- /opt/demo-svc/bin/demo-svc\n"),
        "{unit}"
    );
    r.vmid = 112;
    let files = render_all(&r, &scaffold_features()).unwrap();
    let stack = &files
        .iter()
        .find(|(p, ..)| p == "deploy/service.yml")
        .unwrap()
        .1;
    assert!(
        stack.contains("vmid: 112\nhostname: 112-app-demo-svc"),
        "{stack}"
    );
    assert!(
        stack.contains("env_file: /appdata/demo-svc/demo-svc-config/latch.env"),
        "{stack}"
    );
    assert!(
        stack.contains("--property=EnvironmentFile=/appdata/demo-svc/demo-svc-config/latch.env"),
        "{stack}"
    );
    // fix-3 (Almanac on CT 112, 2026-09-09): every Environment= line the
    // unit declares is reproduced, or a supervised `update --check` runs
    // against the binary's compiled-in default state directory and its
    // failure blames a missing secret. Drilled red by removing the two
    // --property=Environment= lines from the template: both assertions
    // fired, and the unit still declared the variables.
    for line in [
        "--property=Environment=DEMO_SVC_STATE_DIR=/var/lib/demo-svc",
        "--property=Environment=DEMO_SVC_TIMEOUT_STOP_SECS=60",
    ] {
        assert!(
            stack.contains(line),
            "update_cmd is missing {line}:\n{stack}"
        );
    }
    let unit_with_env = &files
        .iter()
        .find(|(p, ..)| p == "deploy/demo-svc.service")
        .unwrap()
        .1;
    for (var, value) in [
        ("DEMO_SVC_STATE_DIR", "/var/lib/demo-svc"),
        ("DEMO_SVC_TIMEOUT_STOP_SECS", "60"),
    ] {
        assert!(
            unit_with_env.contains(&format!("Environment={var}={value}")),
            "the unit declares {var}, so update_cmd must carry it:\n{unit_with_env}"
        );
    }

    // The defaults are what a fresh project always got.
    let fresh = render_all(&rec(), &scaffold_features()).unwrap();
    let unit = &fresh
        .iter()
        .find(|(p, ..)| p == "deploy/demo-svc.service")
        .unwrap()
        .1;
    assert!(
        unit.contains("EnvironmentFile=/etc/demo-svc/demo-svc.env"),
        "{unit}"
    );
    // M1: the gates call the project's own hook when it exists.
    let gates = &fresh
        .iter()
        .find(|(p, ..)| p == ".claude/hooks/gates.sh")
        .unwrap()
        .1;
    assert!(gates.contains("gates.project.sh"), "{gates}");
}

/// 1.7.0: a project's reviewed advisory exceptions live in .chassis.toml
/// and reach the kit-owned deny.toml, so a sync keeps them.
#[test]
fn deny_ignore_reaches_the_rendered_deny_toml() {
    let mut r = rec();
    r.deny_ignore = vec!["RUSTSEC-2023-0071".into(), "RUSTSEC-2025-0012".into()];
    let files = render_all(&r, &scaffold_features()).unwrap();
    let deny = &files.iter().find(|(p, ..)| p == "deny.toml").unwrap().1;
    assert!(
        deny.contains("ignore = [\"RUSTSEC-2023-0071\", \"RUSTSEC-2025-0012\"]"),
        "{deny}"
    );
    let fresh = render_all(&rec(), &scaffold_features()).unwrap();
    let deny = &fresh.iter().find(|(p, ..)| p == "deny.toml").unwrap().1;
    assert!(deny.contains("ignore = []"), "{deny}");
}
