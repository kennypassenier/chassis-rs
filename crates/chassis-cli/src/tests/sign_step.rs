//! The release's signing step must pass minisign's password prompt through to
//! the terminal (fix-7), and the interactive runner must fail loudly.

use crate::process::run_interactive;

const FLOW: &str = include_str!("../release_flow.rs");

#[test]
fn the_sign_step_passes_its_prompt_through() {
    // Escaped quotes: these literals never match their own source line.
    let step = "run_interactive(dir, \"scripts/sign-release.sh\", &[tag])?;";
    assert!(
        FLOW.contains(step),
        "the sign step must not buffer its output"
    );
    let buffered = "run(dir, \"scripts/sign-release.sh\"";
    assert!(!FLOW.contains(buffered), "the sign step went back to run()");
}

#[test]
fn a_failing_interactive_step_is_an_error_that_names_it() {
    let dir = std::env::temp_dir();
    let err = run_interactive(&dir, "false", &[]).unwrap_err();
    assert!(format!("{err:?}").contains("false"));
}

#[test]
fn a_missing_program_is_a_dependency_error() {
    let dir = std::env::temp_dir();
    let err = run_interactive(&dir, "chassis-no-such-program-fix7", &[]).unwrap_err();
    assert!(format!("{err:?}").contains("cannot run"));
}
