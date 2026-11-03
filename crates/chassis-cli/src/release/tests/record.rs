//! The failed-test record after a red run (kyu, 2026-11-03).

use crate::failed_tests::{self, FailedTest, Record};

use super::super::test_step::record_failure;

fn failing() -> FailedTest {
    FailedTest {
        binary: "kyu-runner::l2_pump_dead_letters".into(),
        name: "l2_ar17_a_redirect_is_a_failure_never_followed".into(),
    }
}

fn saved(dir: &std::path::Path) -> Record {
    let rec = Record {
        commit: "0123456789abcdef".into(),
        recorded_at: "2026-11-03T03:00:00Z".into(),
        failed: vec![failing()],
        covered: vec![failing()],
    };
    failed_tests::save(dir, &rec);
    rec
}

/// A rerun nextest refused (no failure readable) keeps the record, so the
/// next release still reruns only those tests instead of the whole suite.
#[test]
fn a_rerun_that_names_no_failure_keeps_the_record() {
    let dir = tempfile::tempdir().unwrap();
    let rec = saved(dir.path());
    record_failure(dir.path(), true, Some(rec.clone()), Vec::new());
    assert_eq!(failed_tests::load(dir.path()), Some(rec));
}

/// A full run that names no failure (a build error) has nothing to keep.
#[test]
fn a_full_run_that_names_no_failure_drops_the_record() {
    let dir = tempfile::tempdir().unwrap();
    let rec = saved(dir.path());
    record_failure(dir.path(), false, Some(rec), Vec::new());
    assert_eq!(failed_tests::load(dir.path()), None);
}
