//! K32: drift that is not a file. `chassis sync` diffs the kit-owned files,
//! but three things it could not see went wrong on 2026-09-06 — Almanac
//! pinned kit 1.7.0 in `Cargo.toml` while `.chassis.toml` said 1.7.1; kyu's
//! branch protection still required the retired check `gates`; and
//! `.chassis.toml`'s `kp_themes` claimed a version nothing verified. This
//! module compares each of them and reports every difference in one shape,
//! `! <what>: <project value> vs <expected> — <remedy>`, printed after the
//! file diffs and counted as drift (exit 1). Since 3.0.0 it also names the
//! kit-owned files the kit no longer ships (the two GitHub Actions
//! workflows, whose work `chassis release` now does locally).
//!
//! Every comparison is a pure function over strings or lists, so the tests
//! need no network; only `fetch_protection` talks to GitHub, and only when
//! `sync --remote` asks for it — a plain `sync` stays offline.
//!
//! The parts: `kit_dependency` (kit tag and features vs `Cargo.toml`),
//! `record` (the `.chassis.toml` lines and the files the kit no longer
//! ships) and `protection` (branch protection on GitHub).

use std::fmt;

mod kit_dependency;
mod protection;
mod record;

pub use kit_dependency::*;
pub use protection::*;
pub use record::*;

/// One difference that is not a file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Drift {
    pub what: String,
    pub project: String,
    pub expected: String,
    pub remedy: String,
}

impl Drift {
    fn new(what: &str, project: String, expected: String, remedy: String) -> Self {
        Self {
            what: what.to_string(),
            project,
            expected,
            remedy,
        }
    }
}

impl fmt::Display for Drift {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "! {}: {} vs {} — {}",
            self.what, self.project, self.expected, self.remedy
        )
    }
}
