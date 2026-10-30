//! Reading a nextest run: strip the colour codes, find the failed tests and
//! build the filterset that selects exactly those tests again.

use std::collections::BTreeSet;

use super::FailedTest;

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
