//! Carry a red test step forward (kit-kp11; Almanac's wish, backing Kenny's
//! rule "never rerun green tests").
//!
//! When the release's nextest step fails, the failed tests, the tree they ran
//! on and the time go to `.chassis/release-failed.json` (git-ignored by the
//! scaffold). The next `chassis release` reruns only those tests when the rule
//! in [`decide`] holds, and says in one line what it skipped and why.
//!
//! The rule, kept deliberately simple:
//! 1. The record exists, names at least one failed test, and `--full-tests` is
//!    not given. The recorded run was a full `--no-fail-fast` run (or a rerun
//!    that descends from one), so every test not named was green on it.
//! 2. Nothing changed since the recorded tree in `Cargo.toml`, `Cargo.lock`, a
//!    build script, the toolchain file or cargo config.
//! 3. Every changed file (docs aside) lives inside a crate that had a failed
//!    test. A change in a crate whose tests were all green, or in a file
//!    outside every crate, may break any test, so the whole suite runs.

//!
//! The parts: `parse` (reading nextest's output), `decide` (the rule above),
//! `workspace` (what git and cargo say about the tree) and `tee` (running
//! nextest with its output shown live and kept). This file holds the record
//! itself and where it lives.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

mod decide;
mod parse;
mod tee;
#[cfg(test)]
mod tests;
mod workspace;

pub use decide::decide;
pub use parse::{filterset, parse_failures};
pub use tee::run_tee;
pub use workspace::{changed_since, now_utc, snapshot_commit, workspace_packages};

/// Where the record lives, relative to the project.
pub const RECORD_PATH: &str = ".chassis/release-failed.json";

/// One failed test as nextest names it: the binary id (`pkg`,
/// `pkg::bin/x`, `pkg::suite`) and the test name inside it.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct FailedTest {
    pub binary: String,
    pub name: String,
}

impl FailedTest {
    /// The package a binary id belongs to: everything before the first `::`.
    pub fn package(&self) -> &str {
        self.binary.split("::").next().unwrap_or(&self.binary)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Record {
    /// The tree the failing run was made on (a commit; a stash-style commit
    /// when the working tree was dirty).
    pub commit: String,
    /// When the run failed, UTC.
    pub recorded_at: String,
    /// Tests still red after the latest run.
    pub failed: Vec<FailedTest>,
    /// Every test that has been red since the recorded full run; their crates
    /// are the ones a fix may touch.
    pub covered: Vec<FailedTest>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    /// Run the whole suite. The reason is `None` when nothing is recorded.
    Full(Option<String>),
    /// Run only these tests; the string is the one-line "skipped, because".
    Rerun(Vec<FailedTest>, String),
}

pub fn record_file(dir: &Path) -> PathBuf {
    dir.join(RECORD_PATH)
}

pub fn load(dir: &Path) -> Option<Record> {
    serde_json::from_str(&std::fs::read_to_string(record_file(dir)).ok()?).ok()
}

pub fn save(dir: &Path, rec: &Record) {
    let path = record_file(dir);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(rec) {
        let _ = std::fs::write(path, json + "\n");
    }
}

pub fn clear(dir: &Path) {
    let _ = std::fs::remove_file(record_file(dir));
}
