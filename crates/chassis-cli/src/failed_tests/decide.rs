//! The rule that decides between the full suite and a rerun of the recorded
//! failures (see the module header of `failed_tests` for the three conditions).

use std::collections::BTreeSet;

use super::{Decision, Record};

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
pub(super) fn owner<'a>(path: &str, packages: &'a [(String, String)]) -> Option<&'a str> {
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
