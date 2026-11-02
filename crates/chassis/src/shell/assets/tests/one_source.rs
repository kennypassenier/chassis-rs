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
            "{name}: import dist/js/index.js (or core.js, lazy-register.js), not the bundle; \
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
