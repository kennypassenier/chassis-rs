//! kp-themes 12 is served as one bundle (and, since 12.2, as the split
//! folder `dist/js/`): no chassis-owned JavaScript may import the loose module
//! tree (a page with both would hold the controller registry, strings and
//! theme registry twice), and the kit's pages import the split folder, never
//! the one-file bundle (two copies of the theme state on one page). The gzip
//! side is in `gzip`.

use super::*;

/// Chassis-owned imports of the tree that are allowed: none since kp-themes
/// 12.0.0 exports `statePlate` from the bundle too.
const TREE_IMPORT_EXCEPTIONS: &[(&str, &str)] = &[];

/// Every chassis-owned `.js` under `static/` (not the vendored `kp/` tree).
fn chassis_owned_js() -> impl Iterator<Item = (&'static str, &'static str)> {
    all_assets()
        .filter(|(n, _, _)| n.ends_with(".js") && !n.starts_with("kp/"))
        .map(|(n, _, b)| (*n, std::str::from_utf8(b).expect("utf-8")))
}

#[test]
fn chassis_javascript_imports_kp_themes_from_the_bundle_only() {
    let mut seen = 0;
    for (name, body) in chassis_owned_js() {
        seen += 1;
        for (i, line) in body.lines().enumerate() {
            if line.trim_start().starts_with("//") || !line.contains("kp/js/") {
                continue;
            }
            let allowed = TREE_IMPORT_EXCEPTIONS
                .iter()
                .any(|(file, module)| *file == name && line.contains(module));
            assert!(
                allowed,
                "{name}:{} imports the kp-themes module tree; import the names from \
                 kp/dist/kp-themes.min.js instead (one source per page): {line}",
                i + 1
            );
        }
    }
    assert!(seen > 20, "the kit's own scripts were found ({seen})");
}

/// The chassis files that deliberately stay on the one-file bundle: the
/// web-app runtime, which is injected into pages of a project's web app that
/// import the bundle themselves.
const BUNDLE_USERS: &[&str] = &["chassis/webapp-runtime.js"];

#[test]
fn kit_pages_import_the_split_folder_not_the_bundle() {
    for (name, body) in chassis_owned_js() {
        let code = body.lines().filter(|l| !l.trim_start().starts_with("//"));
        let imports_bundle = code.clone().any(|l| l.contains("kp/dist/kp-themes.min.js"));
        assert_eq!(
            imports_bundle,
            BUNDLE_USERS.contains(&name),
            "{name}: import the entries under dist/js/ (overlays.js, flash.js, ...), not the bundle; \
             only {BUNDLE_USERS:?} stay on it"
        );
    }
}

#[test]
fn the_split_entries_are_in_the_core_table() {
    for entry in ["auto.js", "core.js", "lazy-register.js", "index.js"] {
        let name = format!("kp/dist/js/{entry}");
        assert!(
            ASSETS.iter().any(|(n, _, _)| *n == name),
            "the kit pages need {name} without the webapp feature"
        );
    }
}

#[test]
fn the_bundle_is_in_the_core_table() {
    assert!(
        ASSETS
            .iter()
            .any(|(n, _, _)| *n == "kp/dist/kp-themes.min.js"),
        "the kit pages need the bundle without the webapp feature"
    );
}

/// Every literal `kp/dist/js/<entry>.js` a kit script imports must be a file
/// the table serves, and none may name `index.js`: that entry re-exports all
/// of kp-themes and would pull every module onto the page. (A name built at
/// run time, `${part}`, is checked by the browser measure, not here.)
#[test]
fn kit_scripts_import_existing_per_module_entries_never_index() {
    let mut seen = 0;
    for (name, body) in chassis_owned_js() {
        for line in body.lines().filter(|l| !l.trim_start().starts_with("//")) {
            let mut rest = line;
            while let Some(at) = rest.find("kp/dist/js/") {
                rest = &rest[at + "kp/dist/js/".len()..];
                let file: String = rest
                    .chars()
                    .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '.')
                    .collect();
                if !file.ends_with(".js") {
                    continue; // `${part}.js`: built at run time
                }
                seen += 1;
                assert_ne!(
                    file, "index.js",
                    "{name}: index.js pulls every kp-themes module"
                );
                let path = format!("kp/dist/js/{file}");
                assert!(
                    ASSETS.iter().any(|(n, _, _)| *n == path),
                    "{name} imports {path}, which is not served"
                );
            }
        }
    }
    assert!(seen > 20, "the kit's entry imports were found ({seen})");
}

/// The kit reads the private statics, so the embedded bytes exist once; the
/// public consts only equal them for outside callers.
#[test]
fn the_public_consts_equal_the_statics() {
    assert_eq!(ASSETS.len(), CORE_TABLE.len());
    #[cfg(feature = "assets")]
    assert_eq!(WEBAPP_KP_ASSETS.len(), WEBAPP_TABLE.len());
    assert!(std::ptr::eq(
        all_assets().next().unwrap(),
        CORE_TABLE.first().unwrap()
    ));
}

/// The modules variant of the web-app runtime (`WebApp::kp_modules`) must hold
/// the app's one copy of kp-themes' state: it imports per-module entries only,
/// never the bundle, and the bundle variant never imports an entry.
#[test]
fn the_runtime_variants_do_not_mix_deliveries() {
    let code = |file: &str| -> String {
        let (_, body) = chassis_owned_js()
            .find(|(n, _)| *n == file)
            .unwrap_or_else(|| panic!("{file} is served"));
        body.lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n")
    };
    let modules = code("chassis/webapp-runtime-modules.js");
    assert!(
        !modules.contains("kp-themes.min.js"),
        "modules runtime imports the bundle"
    );
    assert!(
        modules.contains("kp/dist/js/"),
        "modules runtime imports entries"
    );
    let core = code("chassis/webapp-runtime-core.js");
    assert!(
        !core.contains("kp/dist/"),
        "the shared core imports no kp-themes at all"
    );
    let bundle = code("chassis/webapp-runtime.js");
    assert!(bundle.contains("kp-themes.min.js"));
    assert!(
        !bundle.contains("kp/dist/js/"),
        "bundle runtime imports an entry"
    );
}
