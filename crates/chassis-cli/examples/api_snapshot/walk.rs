//! Walking a crate's source tree: every `.rs` file is parsed and its module
//! path is derived from where it sits, because `syn` sees one file at a time.

use std::path::{Path, PathBuf};

use crate::surface::items;

pub(crate) fn walk(dir: &Path, module: &str, out: &mut Vec<String>, dep: &mut Vec<String>) {
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", dir.display()))
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    entries.sort();
    for path in entries {
        if path.is_dir() {
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            let deeper = with_segment(module, &name);
            walk(&path, &deeper, out, dep);
        } else if path.extension().is_some_and(|e| e == "rs") {
            let stem = path.file_stem().unwrap().to_string_lossy().to_string();
            let here = match stem.as_str() {
                // `mod.rs` and `lib.rs` are the module itself, not a child.
                "mod" | "lib" => module.to_string(),
                other => with_segment(module, other),
            };
            let text = std::fs::read_to_string(&path).expect("a source file reads");
            let file = syn::parse_file(&text)
                .unwrap_or_else(|e| panic!("cannot parse {}: {e}", path.display()));
            items(&file.items, &here, out, dep);
        }
    }
}

pub(crate) fn with_segment(module: &str, seg: &str) -> String {
    if module.is_empty() {
        seg.to_string()
    } else {
        format!("{module}::{seg}")
    }
}
