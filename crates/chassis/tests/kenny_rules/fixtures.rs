//! Reading the kit's assets and repo files as text for the rule locks.

use std::path::Path;

pub fn kit_file(rel: &str) -> String {
    crate::support::kit_bundle(rel)
}

pub fn repo_file(rel: &str) -> String {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    std::fs::read_to_string(root.join(rel)).unwrap_or_else(|e| panic!("{rel}: {e}"))
}
