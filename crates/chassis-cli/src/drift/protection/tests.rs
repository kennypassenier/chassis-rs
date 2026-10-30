//! Protection comparisons and the GitHub payload parser.

use super::*;

fn kit() -> Protection {
    Protection::expected()
}

fn protection(checks: &[&str], strict: bool, enforce_admins: bool) -> Protection {
    Protection {
        checks: checks.iter().map(|c| c.to_string()).collect(),
        strict,
        enforce_admins,
    }
}

// Drilled red once (asserted a line for identical protection): failed, restored.
#[test]
fn k32_identical_protection_is_no_drift() {
    let expected = kit();
    assert!(protection_drift(&expected, &expected.clone()).is_empty());
    // Order does not matter: the API returns the checks as a set.
    let mut two = protection(&["a", "b"], false, false);
    let mut reversed = two.clone();
    reversed.checks.reverse();
    assert!(protection_drift(&two, &reversed).is_empty());
    two.checks.clear();
    assert_eq!(two, kit());
}

/// 3.0.0: the kit ships no CI, so a required check is one no job can
/// satisfy. Every one still required is a line; so is `strict`.
#[test]
fn a_required_check_is_drift_now_that_there_is_no_ci() {
    // All five repositories, measured 2026-09-29: this exact protection.
    let actual = protection(&["fmt · clippy · tests"], true, false);
    let drift = protection_drift(&kit(), &actual);
    assert_eq!(drift.len(), 2, "{drift:?}");
    assert!(
        drift[0].to_string().starts_with(
            "! branch protection: requires `fmt · clippy · tests` vs no CI job produces it"
        ),
        "{}",
        drift[0]
    );
    assert!(
        drift[1]
            .to_string()
            .starts_with("! branch protection: strict = true vs strict = false — "),
        "{}",
        drift[1]
    );
    // Admins forced to wait is drift too (Kenny, 2026-09-10).
    let actual = protection(&[], false, true);
    assert_eq!(
        protection_drift(&kit(), &actual)[0].project,
        "enforce_admins = true"
    );
    // And a check the kit wants but protection lacks is still reported,
    // should the kit ever require one again.
    let wants = protection(&["x"], false, false);
    assert_eq!(protection_drift(&wants, &kit()).len(), 1);
}

// Drilled red once (asserted `strict: false` on the real payload): failed, restored.
#[test]
fn k32_the_github_payload_parses_into_a_protection() {
    // chassis-rs main, `gh api …/branches/main/protection`, 2026-09-06, trimmed.
    let json = r#"{"required_status_checks":{"strict":true,"contexts":["fmt · clippy · tests","cargo-deny (advisories · licenses · bans)"],"checks":[{"context":"fmt · clippy · tests","app_id":15368},{"context":"cargo-deny (advisories · licenses · bans)","app_id":15368}]},"enforce_admins":{"enabled":true},"allow_force_pushes":{"enabled":false}}"#;
    let p = parse_protection(json).unwrap();
    assert_eq!(
        p,
        protection(
            &[
                "fmt · clippy · tests",
                "cargo-deny (advisories · licenses · bans)"
            ],
            true,
            true
        ),
        "contexts and checks name the same jobs once"
    );
    // A payload with only `checks` (newer API shape) still yields the names.
    let p = parse_protection(
        r#"{"required_status_checks":{"strict":false,"checks":[{"context":"gates"}]},"enforce_admins":{"enabled":false}}"#,
    )
    .unwrap();
    assert_eq!(p, protection(&["gates"], false, false));
    assert!(parse_protection("not json").is_err());
}
