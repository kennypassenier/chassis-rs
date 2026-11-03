//! Kenny, 2026-11-03 (absolute): inline styles in HTML never happen. No
//! `style=""` attribute in markup, none built into an HTML string in
//! JavaScript or Rust, no `<style>` block. A static value is a class in the
//! kit's CSS; a dynamic one is set through CSSOM (`el.style.setProperty`)
//! after the element is in the DOM, or rides in a data attribute that
//! `static/chassis/meters.js` paints. CSSOM is allowed under the CSP;
//! markup is not. The policy itself is locked in `shell/http/csp_tests.rs`
//! and `shell/webapp/tests.rs`.
//!
//! The vendored kp-themes tree (`static/kp/`) is not the kit's: kp-themes
//! fixes its own sites (12.4.0).

use std::fs;
use std::path::{Path, PathBuf};

/// What counts as an inline style in text that becomes markup. The escaped
/// forms are the same thing written inside a Rust string.
const PATTERNS: &[&str] = &[
    "style=\"",
    "style='",
    "style=\\\"",
    "style=${",
    "<style",
    "setAttribute('style'",
    "setAttribute(\"style\"",
];

fn files(dir: &Path, exts: &[&str], skip: &dyn Fn(&Path) -> bool, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if skip(&p) {
            continue;
        }
        if p.is_dir() {
            files(&p, exts, skip, out);
        } else if p
            .extension()
            .and_then(|x| x.to_str())
            .is_some_and(|x| exts.contains(&x))
        {
            out.push(p);
        }
    }
}

fn hits(paths: &[PathBuf], skip_comments: bool) -> Vec<String> {
    let mut found = Vec::new();
    for p in paths {
        let Ok(text) = fs::read_to_string(p) else {
            continue;
        };
        for (n, line) in text.lines().enumerate() {
            let t = line.trim_start();
            if skip_comments && (t.starts_with("//") || t.starts_with("/*") || t.starts_with('*')) {
                continue;
            }
            if PATTERNS.iter().any(|pat| line.contains(pat)) {
                found.push(format!("{}:{}: {}", p.display(), n + 1, line.trim()));
            }
        }
    }
    found
}

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn assert_clean(found: Vec<String>) {
    assert!(
        found.is_empty(),
        "inline styles are never allowed (a class in the kit CSS, or CSSOM / a data attribute):\n{}",
        found.join("\n")
    );
}

#[test]
fn the_templates_carry_no_inline_style() {
    let mut f = Vec::new();
    files(
        &root().join("templates"),
        &["html", "txt", "xml"],
        &|_| false,
        &mut f,
    );
    assert!(!f.is_empty(), "no templates found");
    assert_clean(hits(&f, false));
}

#[test]
fn the_kits_scripts_build_no_inline_style() {
    let mut f = Vec::new();
    files(
        &root().join("static/chassis"),
        &["js", "mjs"],
        &|_| false,
        &mut f,
    );
    assert!(f.len() > 50, "the kit's scripts were not found");
    assert_clean(hits(&f, false));
}

#[test]
fn the_kits_rust_strings_and_the_scaffold_emit_no_inline_style() {
    let mut f = Vec::new();
    let is_test_file = |p: &Path| {
        p.file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.contains("tests") || n.ends_with("_tests.rs"))
            || p.file_name().is_some_and(|n| n == "tests")
    };
    files(
        &root().join("src"),
        &["rs", "js", "html", "css"],
        &is_test_file,
        &mut f,
    );
    files(
        &root().join("../../scaffold"),
        &["tmpl", "rs", "js", "html", "md"],
        &|_| false,
        &mut f,
    );
    assert!(!f.is_empty(), "no sources found");
    assert_clean(hits(&f, true));
}
