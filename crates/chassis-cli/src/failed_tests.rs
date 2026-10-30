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

use std::collections::BTreeSet;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::process::{capture, command};

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

fn strip_ansi(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' && chars.peek() == Some(&'[') {
            for n in chars.by_ref() {
                if n.is_ascii_alphabetic() {
                    break;
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// The failed tests in nextest's output: lines like
/// `        FAIL [   0.011s] chassis-cli release::tests::x` (also TIMEOUT and
/// the signal statuses). nextest prints each failure live and again in its
/// summary, so the result is a deduplicated, sorted set.
pub fn parse_failures(output: &str) -> Vec<FailedTest> {
    const STATUSES: [&str; 8] = [
        "FAIL",
        "LEAK-FAIL",
        "TIMEOUT",
        "EXECFAIL",
        "SIGABRT",
        "SIGSEGV",
        "SIGKILL",
        "SIGTERM",
    ];
    let mut set = BTreeSet::new();
    for line in output.lines() {
        let line = strip_ansi(line);
        let line = line.trim_start();
        let Some((status, rest)) = line.split_once(' ') else {
            continue;
        };
        if !STATUSES.contains(&status) {
            continue;
        }
        let rest = rest.trim_start();
        if !rest.starts_with('[') {
            continue;
        }
        let Some((_, after)) = rest.split_once(']') else {
            continue;
        };
        let mut words = after.split_whitespace();
        if let (Some(binary), Some(name)) = (words.next(), words.next()) {
            set.insert(FailedTest {
                binary: binary.to_string(),
                name: name.to_string(),
            });
        }
    }
    set.into_iter().collect()
}

/// The nextest filterset that selects exactly these tests.
pub fn filterset(tests: &[FailedTest]) -> String {
    tests
        .iter()
        .map(|t| format!("(binary_id(={}) & test(={}))", t.binary, t.name))
        .collect::<Vec<_>>()
        .join(" | ")
}

fn basename(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn is_foundational(path: &str) -> bool {
    matches!(
        basename(path),
        "Cargo.toml" | "Cargo.lock" | "build.rs" | "rust-toolchain" | "rust-toolchain.toml"
    ) || path.starts_with(".cargo/")
}

fn is_ignorable(path: &str) -> bool {
    path.starts_with(".chassis/") || path.ends_with(".md")
}

/// The crate directory (relative to the workspace root, `""` for a root
/// package) that owns `path`: the longest matching directory.
fn owner<'a>(path: &str, packages: &'a [(String, String)]) -> Option<&'a str> {
    packages
        .iter()
        .filter(|(_, dir)| dir.is_empty() || path == dir || path.starts_with(&format!("{}/", dir)))
        .max_by_key(|(_, dir)| dir.len())
        .map(|(name, _)| name.as_str())
}

/// Decides between the full suite and a rerun of the recorded failures.
/// `changed` are the paths that differ from the recorded tree, `packages` the
/// workspace's `(name, dir)` pairs.
pub fn decide(
    record: Option<&Record>,
    changed: Result<&[String], &str>,
    packages: &[(String, String)],
    force_full: bool,
) -> Decision {
    if force_full {
        return Decision::Full(Some("--full-tests was given".into()));
    }
    let Some(record) = record else {
        return Decision::Full(None);
    };
    if record.failed.is_empty() {
        return Decision::Full(None);
    }
    let changed = match changed {
        Ok(c) => c,
        Err(why) => return Decision::Full(Some(why.to_string())),
    };
    let covered: BTreeSet<&str> = record.covered.iter().map(|t| t.package()).collect();
    let mut touched = BTreeSet::new();
    for path in changed.iter().filter(|p| !is_ignorable(p)) {
        if is_foundational(path) {
            return Decision::Full(Some(format!(
                "{path} changed since the failed run, which can affect any test"
            )));
        }
        match owner(path, packages) {
            Some(pkg) if covered.contains(pkg) => {
                touched.insert(pkg.to_string());
            }
            Some(pkg) => {
                return Decision::Full(Some(format!(
                    "{path} changed in crate {pkg}, none of whose tests failed last time"
                )));
            }
            None => {
                return Decision::Full(Some(format!(
                    "{path} changed outside every crate, which can affect any test"
                )));
            }
        }
    }
    let n = record.failed.len();
    let short = record.commit.get(..8).unwrap_or(&record.commit);
    let where_ = if touched.is_empty() {
        "nothing but docs changed since".to_string()
    } else {
        format!(
            "changes since touch only {}",
            touched.into_iter().collect::<Vec<_>>().join(", ")
        )
    };
    Decision::Rerun(
        record.failed.clone(),
        format!(
            "rerunning only the {n} test{} that failed on {} (tree {short}); every other test was green \
             on that run and {where_}, so the rest is not run again",
            if n == 1 { "" } else { "s" },
            record.recorded_at,
        ),
    )
}

/// `(name, dir relative to the workspace root)` of every workspace package.
pub fn workspace_packages(dir: &Path) -> Result<Vec<(String, String)>, String> {
    let json = capture(
        dir,
        "cargo",
        &["metadata", "--no-deps", "--format-version", "1"],
    )
    .map_err(|e| format!("cargo metadata failed ({})", e.message))?;
    let v: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| format!("cargo metadata unreadable: {e}"))?;
    let root = PathBuf::from(v["workspace_root"].as_str().unwrap_or_default());
    let mut out = Vec::new();
    for p in v["packages"].as_array().into_iter().flatten() {
        let (Some(name), Some(manifest)) = (p["name"].as_str(), p["manifest_path"].as_str()) else {
            continue;
        };
        let pkg_dir = Path::new(manifest).parent().unwrap_or(Path::new(""));
        let rel = pkg_dir
            .strip_prefix(&root)
            .map(|r| r.to_string_lossy().into_owned())
            .unwrap_or_default();
        out.push((name.to_string(), rel));
    }
    Ok(out)
}

/// Files that differ between the recorded tree and the working tree, plus
/// untracked files (counted as changed: the conservative side).
pub fn changed_since(dir: &Path, commit: &str) -> Result<Vec<String>, String> {
    let top = capture(dir, "git", &["rev-parse", "--show-toplevel"])
        .map_err(|e| e.message)?
        .trim()
        .to_string();
    let diff = capture(dir, "git", &["diff", "--name-only", commit, "--"])
        .map_err(|_| format!("cannot compare with the failed run's tree {commit}"))?;
    let untracked =
        capture(dir, "git", &["ls-files", "-o", "--exclude-standard"]).map_err(|e| e.message)?;
    // `git diff --name-only` is relative to the repo root, `ls-files` to dir.
    let abs_dir = std::fs::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf());
    let sub = abs_dir
        .strip_prefix(&top)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut out: BTreeSet<String> = BTreeSet::new();
    for l in diff.lines().filter(|l| !l.is_empty()) {
        let rel = if sub.is_empty() {
            Some(l)
        } else {
            l.strip_prefix(&format!("{sub}/"))
        };
        if let Some(r) = rel {
            out.insert(r.to_string());
        }
    }
    out.extend(
        untracked
            .lines()
            .filter(|l| !l.is_empty())
            .map(String::from),
    );
    Ok(out.into_iter().collect())
}

/// The tree to record: a commit holding the working tree when it is dirty
/// (`git stash create`), else HEAD.
pub fn snapshot_commit(dir: &Path) -> Option<String> {
    let stash = capture(dir, "git", &["stash", "create"]).ok()?;
    let stash = stash.trim();
    if !stash.is_empty() {
        return Some(stash.to_string());
    }
    Some(
        capture(dir, "git", &["rev-parse", "HEAD"])
            .ok()?
            .trim()
            .to_string(),
    )
}

pub fn now_utc(dir: &Path) -> String {
    capture(dir, "date", &["-u", "+%Y-%m-%dT%H:%M:%SZ"])
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "an unknown time".into())
}

/// Runs a command with its output shown live and kept, so the failures can be
/// read afterwards. Returns `(success, combined output)`.
pub fn run_tee(dir: &Path, program: &str, args: &[String]) -> std::io::Result<(bool, String)> {
    let mut child = command(program, dir)
        .args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let buf = Arc::new(Mutex::new(String::new()));
    let mut handles = Vec::new();
    if let Some(out) = child.stdout.take() {
        let buf = Arc::clone(&buf);
        handles.push(std::thread::spawn(move || {
            pump(out, std::io::stdout(), &buf)
        }));
    }
    if let Some(err) = child.stderr.take() {
        let buf = Arc::clone(&buf);
        handles.push(std::thread::spawn(move || {
            pump(err, std::io::stderr(), &buf)
        }));
    }
    let status = child.wait()?;
    for h in handles {
        let _ = h.join();
    }
    let text = buf.lock().map(|b| b.clone()).unwrap_or_default();
    Ok((status.success(), text))
}

fn pump<R: std::io::Read, W: Write>(from: R, mut to: W, buf: &Mutex<String>) {
    let mut reader = BufReader::new(from);
    let mut line = String::new();
    while reader.read_line(&mut line).is_ok_and(|n| n > 0) {
        let _ = to.write_all(line.as_bytes());
        let _ = to.flush();
        if let Ok(mut b) = buf.lock() {
            b.push_str(&line);
        }
        line.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(binary: &str, name: &str) -> FailedTest {
        FailedTest {
            binary: binary.into(),
            name: name.into(),
        }
    }

    fn pkgs() -> Vec<(String, String)> {
        vec![
            ("chassis".into(), "crates/chassis".into()),
            ("chassis-cli".into(), "crates/chassis-cli".into()),
        ]
    }

    fn record() -> Record {
        Record {
            commit: "0123456789abcdef".into(),
            recorded_at: "2026-10-19T10:00:00Z".into(),
            failed: vec![t("chassis-cli", "release::tests::x")],
            covered: vec![t("chassis-cli", "release::tests::x")],
        }
    }

    fn changed(files: &[&str]) -> Vec<String> {
        files.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn nextest_failures_are_parsed_once_each_with_binary_and_name() {
        let out = "\
        PASS [   0.002s] chassis-cli a::ok
        FAIL [   0.011s] chassis-cli release::tests::x
\u{1b}[31m        FAIL\u{1b}[0m [   0.020s] chassis::bin/tool other::y
TIMEOUT [  60.000s] chassis slow
------------
     Summary [   1.0s] 4 tests run: 1 passed, 3 failed
        FAIL [   0.011s] chassis-cli release::tests::x
";
        // The coloured line keeps its escape codes only around the status.
        let got = parse_failures(out);
        assert_eq!(
            got,
            vec![
                t("chassis", "slow"),
                t("chassis-cli", "release::tests::x"),
                t("chassis::bin/tool", "other::y"),
            ]
        );
        assert_eq!(got[2].package(), "chassis");
    }

    #[test]
    fn the_filterset_selects_exactly_the_recorded_tests() {
        let f = filterset(&[t("a", "m::x"), t("b::bin/z", "y")]);
        assert_eq!(
            f,
            "(binary_id(=a) & test(=m::x)) | (binary_id(=b::bin/z) & test(=y))"
        );
    }

    #[test]
    fn a_fix_inside_the_failed_crate_reruns_only_the_failed_tests() {
        let c = changed(&["crates/chassis-cli/src/release.rs", "CHANGELOG.md"]);
        match decide(Some(&record()), Ok(&c), &pkgs(), false) {
            Decision::Rerun(tests, why) => {
                assert_eq!(tests, record().failed);
                assert!(why.contains("only the 1 test that failed"), "{why}");
                assert!(why.contains("chassis-cli"), "{why}");
            }
            d => panic!("expected a rerun, got {d:?}"),
        }
    }

    #[test]
    fn nothing_recorded_or_forced_runs_everything() {
        let c = changed(&[]);
        assert_eq!(decide(None, Ok(&c), &pkgs(), false), Decision::Full(None));
        assert!(matches!(
            decide(Some(&record()), Ok(&c), &pkgs(), true),
            Decision::Full(Some(w)) if w.contains("--full-tests")
        ));
        let mut empty = record();
        empty.failed.clear();
        assert_eq!(
            decide(Some(&empty), Ok(&c), &pkgs(), false),
            Decision::Full(None)
        );
    }

    #[test]
    fn foundational_files_and_other_crates_force_the_full_suite() {
        for file in [
            "Cargo.lock",
            "crates/chassis-cli/Cargo.toml",
            "crates/chassis-cli/build.rs",
            "rust-toolchain.toml",
            ".cargo/config.toml",
        ] {
            let c = changed(&[file]);
            assert!(
                matches!(
                    decide(Some(&record()), Ok(&c), &pkgs(), false),
                    Decision::Full(Some(_))
                ),
                "{file}"
            );
        }
        let c = changed(&["crates/chassis/src/lib.rs"]);
        match decide(Some(&record()), Ok(&c), &pkgs(), false) {
            Decision::Full(Some(w)) => assert!(w.contains("crate chassis"), "{w}"),
            d => panic!("{d:?}"),
        }
        let c = changed(&["scaffold/README.md.tmpl"]);
        assert!(matches!(
            decide(Some(&record()), Ok(&c), &pkgs(), false),
            Decision::Full(Some(w)) if w.contains("outside every crate")
        ));
        assert!(matches!(
            decide(Some(&record()), Err("git said no"), &pkgs(), false),
            Decision::Full(Some(w)) if w == "git said no"
        ));
    }

    #[test]
    fn a_root_package_owns_what_no_member_does_and_the_longest_dir_wins() {
        let p = vec![
            ("app".to_string(), String::new()),
            ("app-sub".to_string(), "sub".to_string()),
        ];
        assert_eq!(owner("src/main.rs", &p), Some("app"));
        assert_eq!(owner("sub/src/lib.rs", &p), Some("app-sub"));
        assert_eq!(owner("subway/x.rs", &p), Some("app"));
        assert_eq!(owner("x.rs", &pkgs()), None);
    }

    #[test]
    fn the_record_round_trips_and_clears() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(dir.path()), None);
        save(dir.path(), &record());
        assert_eq!(load(dir.path()), Some(record()));
        clear(dir.path());
        assert_eq!(load(dir.path()), None);
    }
}
