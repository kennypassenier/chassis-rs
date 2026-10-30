//! Reading the kit's own CSS and JavaScript as text for the source-level
//! tests. `chassis.css`, `chassis.js` and `notify-card.js` are entry files
//! that pull their parts in from `static/chassis/` (one file per page or
//! component), so a test that asserts on what the kit ships reads the entry
//! and every part it imports.
//!
//! The parts follow the entry in pre-order: a file, then the files it
//! imports in the order it lists them, each once. A page's banner comment is
//! in the file that starts the page, so the text after a page's banner is
//! that page's code, as it was when everything lived in one file.

use std::path::Path;

/// The text of a kit asset; for an entry file the text of its parts follows.
#[allow(dead_code)]
pub fn kit_bundle(rel: &str) -> String {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut seen = Vec::new();
    let mut text = String::new();
    append(root, rel, &mut seen, &mut text);
    text
}

fn append(root: &Path, rel: &str, seen: &mut Vec<String>, text: &mut String) {
    if seen.iter().any(|s| s == rel) {
        return;
    }
    seen.push(rel.to_string());
    let body = std::fs::read_to_string(root.join(rel)).unwrap_or_else(|e| panic!("{rel}: {e}"));
    if !text.is_empty() {
        text.push('\n');
    }
    text.push_str(&body);
    if !matches!(rel.rsplit('.').next(), Some("js" | "css")) {
        return;
    }
    let dir = rel.rsplit_once('/').map_or("", |(d, _)| d);
    for line in body.lines() {
        if let Some(target) = local_import(line) {
            let next = if dir.is_empty() {
                target.to_string()
            } else {
                format!("{dir}/{target}")
            };
            append(root, &next, seen, text);
        }
    }
}

/// The kit file a JS `import` or CSS `@import` line pulls in; imports of the
/// vendored kp-themes tree (`../kp/…`) are not the kit's own text.
fn local_import(line: &str) -> Option<&str> {
    let line = line.trim_start();
    if !(line.starts_with("import ") || line.starts_with("@import ")) {
        return None;
    }
    let quote = line.find(['\'', '"'])?;
    let rest = &line[quote + 1..];
    let target = &rest[..rest.find(['\'', '"'])?];
    if target.starts_with("../") || !(target.ends_with(".js") || target.ends_with(".css")) {
        return None;
    }
    Some(target.strip_prefix("./").unwrap_or(target))
}
