//! Tests of the update decisions: versions, holds, manifests, modes and the startup table.

use super::*;

fn v(s: &str) -> Version {
    Version::parse(s).unwrap()
}

#[test]
fn versions_parse_and_compare_numerically() {
    assert!(v("1.10.0") > v("1.9.9"), "numeric, not lexical");
    assert!(v("2.0.0") > v("1.99.99"));
    assert_eq!(v("v1.2.3"), v("1.2.3"));
    assert!(Version::parse("1.2").is_err());
    assert!(Version::parse("1.2.3-beta").is_err());
    assert_eq!(v("1.2.3").to_string(), "1.2.3");
}

#[test]
fn only_strictly_newer_updates() {
    assert!(should_update(v("1.0.0"), v("1.0.1")));
    assert!(!should_update(v("1.0.1"), v("1.0.1")));
    assert!(!should_update(v("1.0.1"), v("1.0.0")), "never downgrade");
}

#[test]
fn hold_pins_or_skips() {
    assert_eq!(Hold::parse("").unwrap(), Hold::None);
    assert_eq!(Hold::parse("1.4.0").unwrap(), Hold::Pin(v("1.4.0")));
    assert_eq!(Hold::parse("pin:1.4.0").unwrap(), Hold::Pin(v("1.4.0")));
    assert_eq!(Hold::parse("skip:1.4.0").unwrap(), Hold::Skip(v("1.4.0")));
    let pin = Hold::Pin(v("1.4.0"));
    assert!(pin.allows(v("1.3.0"), v("1.4.0")));
    assert!(!pin.allows(v("1.3.0"), v("1.5.0")), "pinned: nothing else");
    assert!(!pin.allows(v("1.4.0"), v("1.4.0")), "already there");
    let skip = Hold::Skip(v("1.4.0"));
    assert!(!skip.allows(v("1.3.0"), v("1.4.0")));
    assert!(skip.allows(v("1.3.0"), v("1.4.1")));
}

#[test]
fn manifest_lookup_and_constant_time_match() {
    let m = "abc123  inbox\nDEF456 *other\n";
    assert_eq!(hash_for(m, "inbox").unwrap(), "abc123");
    assert_eq!(
        hash_for(m, "other").unwrap(),
        "def456",
        "binary-mode star and lower-casing"
    );
    assert!(hash_for(m, "missing").is_err());
    assert!(hash_matches("ABC", "abc"));
    assert!(!hash_matches("abc", "abd"));
}

#[test]
fn modes_parse_and_containers_force_off_but_lxc_does_not() {
    assert_eq!(Mode::parse("Supervised").unwrap(), Mode::Supervised);
    assert!(Mode::parse("sometimes").is_err());
    let docker = ContainerEvidence {
        dockerenv: true,
        ..Default::default()
    };
    assert_eq!(effective_mode(Mode::Autonomous, &docker).mode, Mode::Off);
    assert_eq!(
        effective_mode(Mode::Supervised, &docker).mode,
        Mode::Supervised,
        "supervised is the supervisor's call"
    );
    let lxc = ContainerEvidence {
        pid1_cgroup: "0::/lxc/118/init.scope\n".into(),
        ..Default::default()
    };
    assert_eq!(
        effective_mode(Mode::Autonomous, &lxc).mode,
        Mode::Autonomous,
        "an LXC still updates itself (critic #19)"
    );
    let cg_v1 = ContainerEvidence {
        pid1_cgroup: "1:name=systemd:/docker/abc\n".into(),
        ..Default::default()
    };
    assert!(is_managed_image(&cg_v1));
}

fn state(attempts: u32) -> UpdateState {
    UpdateState {
        from_version: "1.0.0".into(),
        to_version: "1.1.0".into(),
        previous_binary: "/opt/x/x.prev".into(),
        attempts,
    }
}

// Almanac's decision table, plus the two additions.
#[test]
fn startup_decision_table() {
    assert_eq!(decide_at_startup(None, "1.1.0", 2), StartAction::Normal);
    // First start of the new version serves (attempt 1 of 2).
    match decide_at_startup(Some(state(0)), "1.1.0", 2) {
        StartAction::Probation(s) => assert_eq!(s.attempts, 1),
        other => panic!("{other:?}"),
    }
    // Second start of the same unproven version reverts.
    assert!(matches!(
        decide_at_startup(Some(state(1)), "1.1.0", 2),
        StartAction::Revert(_)
    ));
    // A larger knob gives more room.
    assert!(matches!(
        decide_at_startup(Some(state(1)), "1.1.0", 3),
        StartAction::Probation(_)
    ));
    // Zero is treated as one: the first start already decides.
    assert!(matches!(
        decide_at_startup(Some(state(0)), "1.1.0", 0),
        StartAction::Revert(_)
    ));
    // The binary running is not the one the state names: stale (critic #20).
    assert!(matches!(
        decide_at_startup(Some(state(0)), "1.0.0", 2),
        StartAction::Stale(_)
    ));
}

#[test]
fn drill_marker_is_version_bound() {
    let m = DrillMarker {
        version: "1.1.0".into(),
        kind: "broken".into(),
    };
    assert_eq!(drill_applies(Some(&m), "1.1.0"), Some("broken"));
    assert_eq!(
        drill_applies(Some(&m), "1.0.0"),
        None,
        "the restored version runs normally"
    );
    assert_eq!(drill_applies(None, "1.1.0"), None);
}
