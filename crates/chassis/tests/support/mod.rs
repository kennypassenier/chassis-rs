//! Reading the kit's own CSS and JavaScript as text for the source-level
//! tests. `chassis.css`, `chassis.js` and `notify-card.js` are entry files
//! that pull their parts in from `static/chassis/` (one file per page or
//! component), so a test that asserts on what the kit ships reads the entry
//! and every part, in the order the entry lists them.

use std::path::Path;

/// The text of a kit asset; for an entry file the text of its parts follows.
#[allow(dead_code)]
pub fn kit_bundle(rel: &str) -> String {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut text = std::fs::read_to_string(root.join(rel)).unwrap_or_else(|e| panic!("{rel}: {e}"));
    let ext = match rel {
        "static/chassis.css" => "css",
        "static/chassis.js" | "static/notify-card.js" => "js",
        _ => return text,
    };
    let mut parts: Vec<_> = std::fs::read_dir(root.join("static/chassis"))
        .expect("static/chassis")
        .map(|e| e.expect("entry").path())
        .filter(|p| p.extension().is_some_and(|e| e == ext))
        .collect();
    parts.sort();
    for part in parts {
        text.push('\n');
        text.push_str(&std::fs::read_to_string(&part).unwrap_or_else(|e| panic!("{part:?}: {e}")));
    }
    text
}
