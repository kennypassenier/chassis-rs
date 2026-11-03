//! Step 6 of `chassis release`: the human signing step. Its own module
//! because it is the one step whose failure is not a failure of the release:
//! everything is already published, and what is left needs a key and a
//! password only the person has (runner-1, kyu-runner 2026-09-10: the same
//! exit 1 for "waiting for Kenny's key" and "something broke").

use std::path::Path;

use chassis::Error;

use crate::exit_codes::Finish;
use crate::process::run_interactive;

/// Signs locally and uploads `.minisig` before `VERSION`. Interactive:
/// minisign prints its password prompt and must be seen where there is a
/// terminal. Returns how the release ended, not whether the step worked.
pub(super) fn sign(dir: &Path, name: &str, tag: &str, signing: bool) -> Finish {
    if !signing {
        println!(
            "chassis release: signing is left to you ([release] sign = false): the release is unsigned until you sign {tag}"
        );
        println!("released {name} {tag}, unsigned");
        return Finish::WaitingForSign;
    }
    let result = run_interactive(dir, "scripts/sign-release.sh", &[tag]);
    after_signing(result, name, tag)
}

/// What the sign step's result means for the exit status. A failure here
/// leaves a published but unsigned release, which the updater ignores, so it
/// is reported as waiting with the command that finishes it.
pub(super) fn after_signing(result: Result<(), Error>, name: &str, tag: &str) -> Finish {
    match result {
        Ok(()) => {
            println!("released {name} {tag}");
            Finish::Clean
        }
        Err(e) => {
            eprintln!("{e}");
            println!(
                "chassis release: published {name} {tag}, waiting on the human signing step. \
                 What now: run `scripts/sign-release.sh {tag}` (exit status 3, not a failure)"
            );
            Finish::WaitingForSign
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_signed_release_is_clean() {
        assert_eq!(after_signing(Ok(()), "svc", "v1.0.0"), Finish::Clean);
    }

    #[test]
    fn a_failed_sign_step_is_waiting_not_a_failure() {
        let err = Error::dependency("scripts/sign-release.sh v1.0.0 failed", "retry");
        assert_eq!(
            after_signing(Err(err), "svc", "v1.0.0"),
            Finish::WaitingForSign
        );
    }

    #[test]
    fn signing_left_to_the_person_is_waiting() {
        let dir = std::env::temp_dir();
        assert_eq!(sign(&dir, "svc", "v1.0.0", false), Finish::WaitingForSign);
    }
}
