//! The test step of the release gate. A red nextest run is recorded
//! (`failed_tests`), and the next release reruns only those tests when
//! `failed_tests::decide` allows. Its own module because it is the one gate
//! step with state that outlives the release.

use std::path::Path;

use chassis::Error;

use super::{cargo_plugin_available, step, took};
use crate::failed_tests;

/// The test step. A red nextest run is recorded (`failed_tests`), and the next
/// release reruns only those tests when `failed_tests::decide` allows; every
/// run reports its measured duration (Kenny, 2026-10-02).
pub(super) fn run_tests(dir: &Path, full_tests: bool) -> Result<(), Error> {
    let tests = std::time::Instant::now();
    // Kenny, 2026-10-04: the suites run side by side when cargo-nextest
    // is installed; nextest cannot run doctests, so those follow.
    if !cargo_plugin_available(dir, "nextest") {
        println!(
            "chassis release: cargo-nextest is not installed, so the suites run one after another (cargo install cargo-nextest --locked)"
        );
        step(dir, "tests", "cargo", &["test"])?;
        println!(
            "chassis release: tests took {} (measured)",
            took(tests.elapsed())
        );
        return Ok(());
    }
    let record = failed_tests::load(dir);
    let (only, filter) = choose_run(dir, record.as_ref(), full_tests);
    let mut args: Vec<String> = if only {
        ["nextest", "run", "--no-fail-fast", "-E"]
            .map(String::from)
            .to_vec()
    } else {
        ["nextest", "run", "--no-fail-fast"]
            .map(String::from)
            .to_vec()
    };
    args.extend(filter);
    println!(
        "chassis release: tests{}: cargo {}",
        if only {
            " (only the recorded failures)"
        } else {
            " (cargo-nextest, suites side by side)"
        },
        args.join(" ")
    );
    let (ok, output) = failed_tests::run_tee(dir, "cargo", &args).map_err(|e| {
        Error::dependency(
            format!("cannot run cargo: {e}"),
            "is cargo installed and on PATH?",
        )
    })?;
    if !ok {
        let failures = failed_tests::parse_failures(&output);
        println!(
            "chassis release: tests took {} (measured), {} failed",
            took(tests.elapsed()),
            failures.len()
        );
        record_failure(dir, only, record, failures);
        return Err(Error::dependency(
            "tests failed (cargo nextest run)",
            "fix them and run `chassis release` again: only the failed tests rerun when the change stays inside their crates (--full-tests runs everything)",
        ));
    }
    if !only {
        failed_tests::clear(dir);
    }
    if dir.join("src/lib.rs").is_file() {
        step(dir, "doctests", "cargo", &["test", "--doc"])?;
    }
    println!(
        "chassis release: tests took {} (measured)",
        took(tests.elapsed())
    );
    Ok(())
}

/// Whether this run is only the recorded failures, and the nextest filter
/// that selects them. Says why on stdout when it picks either.
fn choose_run(
    dir: &Path,
    record: Option<&failed_tests::Record>,
    full_tests: bool,
) -> (bool, Option<String>) {
    let decision = match record {
        Some(r) if !full_tests && !r.failed.is_empty() => {
            let changed = failed_tests::changed_since(dir, &r.commit);
            let packages = failed_tests::workspace_packages(dir);
            match (&changed, &packages) {
                (Ok(c), Ok(p)) => failed_tests::decide(record, Ok(c), p, false),
                (Err(e), _) | (_, Err(e)) => failed_tests::decide(record, Err(e), &[], false),
            }
        }
        _ => failed_tests::decide(record, Ok(&[]), &[], full_tests),
    };
    match decision {
        failed_tests::Decision::Rerun(tests, why) => {
            println!("chassis release: tests: {why}");
            let f = failed_tests::filterset(&tests);
            (true, Some(f))
        }
        failed_tests::Decision::Full(why) => {
            if let Some(why) = why {
                println!("chassis release: tests: running the whole suite, because {why}");
            }
            (false, None)
        }
    }
}

/// Writes (or drops) the record after a red test step.
fn record_failure(
    dir: &Path,
    was_rerun: bool,
    old: Option<failed_tests::Record>,
    failures: Vec<failed_tests::FailedTest>,
) {
    if failures.is_empty() {
        // Nothing parsed (a build error, or the filter matched no test):
        // the next release starts from the whole suite.
        failed_tests::clear(dir);
        return;
    }
    let record = match old {
        Some(mut r) if was_rerun => {
            for f in &failures {
                if !r.covered.contains(f) {
                    r.covered.push(f.clone());
                }
            }
            r.failed = failures;
            r
        }
        _ => {
            let Some(commit) = failed_tests::snapshot_commit(dir) else {
                failed_tests::clear(dir);
                return;
            };
            failed_tests::Record {
                commit,
                recorded_at: failed_tests::now_utc(dir),
                covered: failures.clone(),
                failed: failures,
            }
        }
    };
    failed_tests::save(dir, &record);
    println!(
        "chassis release: recorded the failed tests in {}",
        failed_tests::RECORD_PATH
    );
}
