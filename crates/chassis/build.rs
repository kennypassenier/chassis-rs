//! Build script: generates the embedded-asset tables from `static/`.
//!
//! Until 3.14 `src/shell/assets.rs` carried two hand-kept lists of
//! `("path", "mime", include_bytes!(..))` entries (~1,350 lines) that had to
//! be edited in step with every file added to `static/`. This script walks
//! `static/` instead and writes the two tables (`ASSETS`, `WEBAPP_KP_ASSETS`)
//! into `OUT_DIR`, where `assets.rs` pulls them in with `include!`. The
//! rules below are the whole policy; nothing else decides what is embedded.
//!
//! An extension the script does not know is a build error, never a silent
//! skip: a new kind of file must be classified here on purpose.

use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::{env, fs, process};

/// Extension → content type. Every embedded file's type comes from here.
const MIME_BY_EXTENSION: &[(&str, &str)] = &[
    ("css", "text/css; charset=utf-8"),
    ("js", "text/javascript; charset=utf-8"),
    ("woff2", "font/woff2"),
];

/// Files that live in the vendored tree for the manifest gate only and are
/// never served: licence texts, the font catalogue and the sha256 manifest.
const NOT_SERVED_FILE_NAMES: &[&str] = &["LICENSE"];
const NOT_SERVED_EXTENSIONS: &[&str] = &["json", "txt", "sha256"];

/// The kp-themes JavaScript every page needs (theme boot, picker, strings,
/// components, the effect hooks `effects.js` imports). They go in `ASSETS`;
/// every other `kp/js/**` module goes in `WEBAPP_KP_ASSETS`, the set
/// `assets.rs` serves next to them when the `assets` feature is on.
const CORE_KP_JS: &[&str] = &[
    "kp/js/no-flash.js",
    "kp/js/theme-registry.js",
    "kp/js/theme-core.js",
    "kp/js/theme-picker.js",
    "kp/js/strings.js",
    "kp/js/components.js",
    "kp/js/effects.js",
    "kp/js/as-of.js",
    "kp/js/effects/arrival.js",
    "kp/js/effects/caret.js",
    "kp/js/effects/count.js",
    "kp/js/effects/emphasis.js",
    "kp/js/effects/headline.js",
    "kp/js/effects/marquee.js",
    "kp/js/effects/measure.js",
    "kp/js/effects/pointer.js",
    "kp/js/effects/rule.js",
];

/// Prefix of the kp-themes JavaScript tree, split between the two tables.
const KP_JS_PREFIX: &str = "kp/js/";

fn main() {
    let root =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR")).join("static");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=static");
    let mut files = Vec::new();
    collect(&root, &root, &mut files);
    files.sort();
    let (mut core, mut webapp) = (String::new(), String::new());
    for rel in &files {
        let Some(mime) = classify(rel) else { continue };
        let entry = entry(&root, rel, mime);
        let is_webapp = rel.starts_with(KP_JS_PREFIX) && !CORE_KP_JS.contains(&rel.as_str());
        if is_webapp {
            webapp.push_str(&entry)
        } else {
            core.push_str(&entry)
        }
    }
    for needed in CORE_KP_JS {
        if !files.iter().any(|f| f == needed) {
            fail(&format!(
                "CORE_KP_JS names {needed}, which is not under static/"
            ));
        }
    }
    let out = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    write(&out.join("assets_core.rs"), &core);
    write(&out.join("assets_webapp.rs"), &webapp);
}

/// Every file under `dir`, as a `/`-separated path relative to `root`.
fn collect(root: &Path, dir: &Path, into: &mut Vec<String>) {
    let entries =
        fs::read_dir(dir).unwrap_or_else(|e| fail(&format!("read {}: {e}", dir.display())));
    for entry in entries {
        let path = entry
            .unwrap_or_else(|e| fail(&format!("read entry: {e}")))
            .path();
        if path.is_dir() {
            collect(root, &path, into);
        } else {
            let rel = path.strip_prefix(root).expect("under root");
            let parts: Vec<_> = rel.iter().map(|p| p.to_string_lossy()).collect();
            into.push(parts.join("/"));
        }
    }
}

/// The content type to embed `rel` with, or `None` when it is deliberately
/// not served. An unknown extension stops the build.
fn classify(rel: &str) -> Option<&'static str> {
    let name = rel.rsplit('/').next().unwrap_or(rel);
    let ext = name.rsplit_once('.').map(|(_, e)| e).unwrap_or("");
    if NOT_SERVED_FILE_NAMES.contains(&name) || NOT_SERVED_EXTENSIONS.contains(&ext) {
        return None;
    }
    match MIME_BY_EXTENSION.iter().find(|(e, _)| *e == ext) {
        Some((_, mime)) => Some(mime),
        None => fail(&format!(
            "static/{rel}: no content type for extension `{ext}`; add it to MIME_BY_EXTENSION \
             or to the NOT_SERVED_* rules in crates/chassis/build.rs"
        )),
    }
}

/// One table row; the absolute path makes `include_bytes!` independent of
/// where the generated file sits.
fn entry(root: &Path, rel: &str, mime: &str) -> String {
    let abs = root.join(rel);
    let mut row = String::new();
    writeln!(
        row,
        "    ({rel:?}, {mime:?}, include_bytes!({:?})),",
        abs.to_string_lossy()
    )
    .unwrap();
    row
}

/// Writes `&[ rows ]`, the expression `assets.rs` includes.
fn write(path: &Path, rows: &str) {
    fs::write(path, format!("&[\n{rows}]\n"))
        .unwrap_or_else(|e| fail(&format!("write {}: {e}", path.display())));
}

fn fail(msg: &str) -> ! {
    eprintln!("chassis build.rs: {msg}");
    process::exit(1)
}
