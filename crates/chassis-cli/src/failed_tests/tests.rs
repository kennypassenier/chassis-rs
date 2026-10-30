//! Tests of the failed-test record: parsing, the filterset and the rerun rule.

use super::decide::owner;
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
