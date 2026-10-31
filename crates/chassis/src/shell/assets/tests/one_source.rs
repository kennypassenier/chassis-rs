//! kp-themes 12 is served as one bundle: no chassis-owned JavaScript may
//! still import the module tree (a page with both would hold the controller
//! registry, strings and theme registry twice). The gzip side is in `gzip`.

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

#[test]
fn the_bundle_is_in_the_core_table() {
    assert!(
        ASSETS
            .iter()
            .any(|(n, _, _)| *n == "kp/dist/kp-themes.min.js"),
        "the kit pages need the bundle without the webapp feature"
    );
}
