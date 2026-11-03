//! The exit codes of the `chassis` command, in one place, so the help text,
//! the commands and the tests agree on what a status means.
//!
//! 0 and 1 are the ones every tool has. 2 is taken: clap exits 2 for a
//! command line it cannot parse, so the codes the kit adds start at 3.

use std::process::ExitCode;

/// `chassis release` published everything and stopped at the human signing
/// step (or signing is left to the person): nothing failed, a key is awaited.
pub(crate) const WAITING_FOR_SIGN: u8 = 3;

/// `chassis sync` found no drift of its own, only differences the project
/// declared in `.chassis.toml` (`deviations = [...]`).
pub(crate) const DECLARED_DEVIATION: u8 = 4;

/// The help text appended to `chassis --help`.
pub(crate) const HELP: &str = "\
Exit codes:
  0  done, or in sync
  1  failure, or drift found and not applied (stderr carries the remedy)
  2  the command line could not be parsed
  3  release: published, waiting on the human signing step (scripts/sign-release.sh)
  4  sync: in sync except for deviations declared in .chassis.toml";

/// How a command ended, when it did not fail with an error.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Finish {
    Clean,
    /// Drift that is still there: the old exit 1 of `sync`.
    Unresolved,
    WaitingForSign,
    DeclaredDeviation,
}

impl Finish {
    pub(crate) fn code(self) -> u8 {
        match self {
            Finish::Clean => 0,
            Finish::Unresolved => 1,
            Finish::WaitingForSign => WAITING_FOR_SIGN,
            Finish::DeclaredDeviation => DECLARED_DEVIATION,
        }
    }

    pub(crate) fn exit_code(self) -> ExitCode {
        ExitCode::from(self.code())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_finish_has_its_own_code_and_none_is_clap_s() {
        let all = [
            Finish::Clean,
            Finish::Unresolved,
            Finish::WaitingForSign,
            Finish::DeclaredDeviation,
        ];
        let mut codes: Vec<u8> = all.iter().map(|f| f.code()).collect();
        assert!(!codes.contains(&2), "2 is clap's usage error");
        codes.sort_unstable();
        codes.dedup();
        assert_eq!(codes.len(), all.len(), "a code was reused");
    }

    #[test]
    fn the_help_names_every_code() {
        for code in [WAITING_FOR_SIGN, DECLARED_DEVIATION] {
            assert!(HELP.contains(&format!("  {code}  ")), "{code} missing");
        }
    }
}
