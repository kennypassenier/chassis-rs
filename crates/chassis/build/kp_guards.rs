//! Build-time guards for the kp-themes files the kit pages cannot start
//! without. A vendoring that forgets one of them is a build error here, not
//! a 404 in a browser (included from `build.rs`).

use std::collections::BTreeSet;

/// The one-file module (chassis' older JS and the web apps may still import
/// it). It is not under `kp/js/`, so the table rule puts it in the core
/// table already; naming it makes a vendoring that forgets it a build error.
pub const KP_BUNDLE: &str = "kp/dist/kp-themes.min.js";

/// The split module bundle (kp-themes 12.2): the page's boot entry (`auto.js`),
/// the two entries every kit page imports by name (`core.js`,
/// `lazy-register.js`; the rest of the kit imports its per-module entries,
/// `overlays.js`, `flash.js`, ... ) and `index.js`. No kit page loads
/// `index.js`; it stays because apps may import it. It does not re-export
/// every module (`busy-card.js` is only an entry), so the folder is checked
/// from every unhashed file in it (`split_roots`), not from these four.
pub const SPLIT_ENTRIES: &[&str] = &[
    "kp/dist/js/auto.js",
    "kp/dist/js/core.js",
    "kp/dist/js/lazy-register.js",
    "kp/dist/js/index.js",
];

/// The roots the split folder is checked from: the required entries plus every
/// other file in the folder that is not a content-hashed chunk, i.e. each
/// per-module entry (kp-themes 12.2 gives every component one).
pub fn split_roots(files: &[String]) -> Vec<&str> {
    let mut roots: Vec<&str> = SPLIT_ENTRIES.to_vec();
    for f in files {
        let name = f.strip_prefix(SPLIT_JS_PREFIX);
        if name.is_some_and(|n| n.ends_with(".js") && !n.starts_with("chunk-") && !n.contains('/'))
        {
            roots.push(f);
        }
    }
    roots
}

/// The base stylesheet and the register the no-flash fallback names (the
/// server writes `{theme}` into the register pattern; `formal` is the
/// registry's fallback, so it must exist).
pub const SPLIT_CSS: &[&str] = &[
    "kp/dist/kp-themes-base.min.css",
    "kp/dist/css/formal-register.min.css",
];

/// Prefix of the split module folder; `import_closure` follows its
/// `./chunk-*.js` imports like any other relative import.
pub const SPLIT_JS_PREFIX: &str = "kp/dist/js/";

/// Stops the build when a named file is not under `static/`.
pub fn require_files(files: &[String], names: &[&str], what: &str) -> Result<(), String> {
    for needed in names {
        if !files.iter().any(|f| f == needed) {
            return Err(format!("{what} names {needed}, which is not under static/"));
        }
    }
    Ok(())
}

/// The split folder must be whole: every `.js` file under it is reachable
/// from a root (an entry; a chunk nothing imports is a stale leftover), and
/// every file the entries import exists (a missing chunk is a 404 that only
/// shows once a widget is used).
pub fn check_split_folder(files: &[String], closure: &BTreeSet<String>) -> Result<(), String> {
    let in_folder = |f: &&String| f.starts_with(SPLIT_JS_PREFIX) && f.ends_with(".js");
    let on_disk: BTreeSet<&String> = files.iter().filter(in_folder).collect();
    for rel in closure.iter().filter(|r| r.starts_with(SPLIT_JS_PREFIX)) {
        if !on_disk.contains(rel) {
            return Err(format!(
                "{rel} is imported inside {SPLIT_JS_PREFIX} but is not under static/"
            ));
        }
    }
    if let Some(stray) = on_disk.iter().find(|f| !closure.contains(**f)) {
        return Err(format!(
            "{stray} is not imported by any split entry; vendor the folder whole"
        ));
    }
    Ok(())
}
