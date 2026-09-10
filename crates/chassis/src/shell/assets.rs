//! Static assets (K15): the vendored @kp-soft/themes tree — the release's
//! own bundle `dist/kp-themes.css` (themes, components, layout, utilities
//! and all twenty-five theme registers, each scoped to its theme), the
//! fonts stylesheet and the woff2 files behind it (S8: nothing loads from
//! a third party), seven JavaScript modules — plus the kit's own CSS/JS,
//! embedded with `include_bytes!` and served under a content-hash query so
//! browsers may cache them for a year.
//!
//! The vendored files are byte-for-byte copies of the kp-themes release
//! named in `static/kp/KP_THEMES.sha256`, kept under the package's own
//! paths (`kp/dist/…`, `kp/css/…`, `kp/js/…`, `kp/fonts/…`) so
//! `fonts.css`'s relative `url('../fonts/…')` and the modules'
//! `./strings.js` imports resolve unchanged. A test below compares every copy against that manifest, so
//! a stray edit or a half-done bump fails the gates offline (kyu's rule).
//! Bumping kp-themes = re-copy the tree, refresh the manifest, run the
//! tests.

use axum::extract::{Path, RawQuery};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};

/// The kp-themes version the kit vendors (C3: one place).
pub const KP_THEMES_VERSION: &str = "5.1.0";

/// name → (content type, bytes). Explicit list, no path joining (kyu's
/// traversal-proof shape).
pub const ASSETS: &[(&str, &str, &[u8])] = &[
    (
        "kp/dist/kp-themes.css",
        "text/css; charset=utf-8",
        include_bytes!("../../static/kp/dist/kp-themes.css"),
    ),
    (
        "kp/css/fonts.css",
        "text/css; charset=utf-8",
        include_bytes!("../../static/kp/css/fonts.css"),
    ),
    (
        "kp/js/no-flash.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/no-flash.js"),
    ),
    (
        "kp/js/theme-registry.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/theme-registry.js"),
    ),
    (
        "kp/js/theme-core.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/theme-core.js"),
    ),
    (
        "kp/js/theme-picker.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/theme-picker.js"),
    ),
    (
        "kp/js/strings.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/strings.js"),
    ),
    (
        "kp/js/components.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/components.js"),
    ),
    (
        "kp/js/effects.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/kp/js/effects.js"),
    ),
    (
        "kp/fonts/archivo/archivo-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/archivo/archivo-italic-variable.woff2"),
    ),
    (
        "kp/fonts/archivo/archivo-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/archivo/archivo-variable.woff2"),
    ),
    (
        "kp/fonts/archivoblack/archivoblack-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/archivoblack/archivoblack-regular.woff2"),
    ),
    (
        "kp/fonts/atkinsonhyperlegible/atkinsonhyperlegible-bold.woff2",
        "font/woff2",
        include_bytes!(
            "../../static/kp/fonts/atkinsonhyperlegible/atkinsonhyperlegible-bold.woff2"
        ),
    ),
    (
        "kp/fonts/atkinsonhyperlegible/atkinsonhyperlegible-bolditalic.woff2",
        "font/woff2",
        include_bytes!(
            "../../static/kp/fonts/atkinsonhyperlegible/atkinsonhyperlegible-bolditalic.woff2"
        ),
    ),
    (
        "kp/fonts/atkinsonhyperlegible/atkinsonhyperlegible-italic.woff2",
        "font/woff2",
        include_bytes!(
            "../../static/kp/fonts/atkinsonhyperlegible/atkinsonhyperlegible-italic.woff2"
        ),
    ),
    (
        "kp/fonts/atkinsonhyperlegible/atkinsonhyperlegible-regular.woff2",
        "font/woff2",
        include_bytes!(
            "../../static/kp/fonts/atkinsonhyperlegible/atkinsonhyperlegible-regular.woff2"
        ),
    ),
    (
        "kp/fonts/barlow/barlow-bold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/barlow/barlow-bold.woff2"),
    ),
    (
        "kp/fonts/barlow/barlow-italic.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/barlow/barlow-italic.woff2"),
    ),
    (
        "kp/fonts/barlow/barlow-medium.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/barlow/barlow-medium.woff2"),
    ),
    (
        "kp/fonts/barlow/barlow-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/barlow/barlow-regular.woff2"),
    ),
    (
        "kp/fonts/barlow/barlow-semibold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/barlow/barlow-semibold.woff2"),
    ),
    (
        "kp/fonts/barlowcondensed/barlowcondensed-blackitalic.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/barlowcondensed/barlowcondensed-blackitalic.woff2"),
    ),
    (
        "kp/fonts/barlowcondensed/barlowcondensed-bold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/barlowcondensed/barlowcondensed-bold.woff2"),
    ),
    (
        "kp/fonts/barlowcondensed/barlowcondensed-extrabolditalic.woff2",
        "font/woff2",
        include_bytes!(
            "../../static/kp/fonts/barlowcondensed/barlowcondensed-extrabolditalic.woff2"
        ),
    ),
    (
        "kp/fonts/barlowcondensed/barlowcondensed-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/barlowcondensed/barlowcondensed-regular.woff2"),
    ),
    (
        "kp/fonts/barlowcondensed/barlowcondensed-semibold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/barlowcondensed/barlowcondensed-semibold.woff2"),
    ),
    (
        "kp/fonts/bigshouldersdisplay/bigshouldersdisplay-variable.woff2",
        "font/woff2",
        include_bytes!(
            "../../static/kp/fonts/bigshouldersdisplay/bigshouldersdisplay-variable.woff2"
        ),
    ),
    (
        "kp/fonts/cormorantgaramond/cormorantgaramond-italic-variable.woff2",
        "font/woff2",
        include_bytes!(
            "../../static/kp/fonts/cormorantgaramond/cormorantgaramond-italic-variable.woff2"
        ),
    ),
    (
        "kp/fonts/cormorantgaramond/cormorantgaramond-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/cormorantgaramond/cormorantgaramond-variable.woff2"),
    ),
    (
        "kp/fonts/fraunces/fraunces-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/fraunces/fraunces-italic-variable.woff2"),
    ),
    (
        "kp/fonts/fraunces/fraunces-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/fraunces/fraunces-variable.woff2"),
    ),
    (
        "kp/fonts/geistmono/geistmono-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/geistmono/geistmono-variable.woff2"),
    ),
    (
        "kp/fonts/ibmplexmono/ibmplexmono-bold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/ibmplexmono/ibmplexmono-bold.woff2"),
    ),
    (
        "kp/fonts/ibmplexmono/ibmplexmono-italic.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/ibmplexmono/ibmplexmono-italic.woff2"),
    ),
    (
        "kp/fonts/ibmplexmono/ibmplexmono-medium.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/ibmplexmono/ibmplexmono-medium.woff2"),
    ),
    (
        "kp/fonts/ibmplexmono/ibmplexmono-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/ibmplexmono/ibmplexmono-regular.woff2"),
    ),
    (
        "kp/fonts/ibmplexsans/ibmplexsans-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/ibmplexsans/ibmplexsans-italic-variable.woff2"),
    ),
    (
        "kp/fonts/ibmplexsans/ibmplexsans-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/ibmplexsans/ibmplexsans-variable.woff2"),
    ),
    (
        "kp/fonts/instrumentsans/instrumentsans-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/instrumentsans/instrumentsans-italic-variable.woff2"),
    ),
    (
        "kp/fonts/instrumentsans/instrumentsans-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/instrumentsans/instrumentsans-variable.woff2"),
    ),
    (
        "kp/fonts/instrumentserif/instrumentserif-italic.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/instrumentserif/instrumentserif-italic.woff2"),
    ),
    (
        "kp/fonts/instrumentserif/instrumentserif-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/instrumentserif/instrumentserif-regular.woff2"),
    ),
    (
        "kp/fonts/inter/inter-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/inter/inter-italic-variable.woff2"),
    ),
    (
        "kp/fonts/inter/inter-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/inter/inter-variable.woff2"),
    ),
    (
        "kp/fonts/intertight/intertight-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/intertight/intertight-italic-variable.woff2"),
    ),
    (
        "kp/fonts/intertight/intertight-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/intertight/intertight-variable.woff2"),
    ),
    (
        "kp/fonts/josefinsans/josefinsans-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/josefinsans/josefinsans-italic-variable.woff2"),
    ),
    (
        "kp/fonts/josefinsans/josefinsans-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/josefinsans/josefinsans-variable.woff2"),
    ),
    (
        "kp/fonts/lora/lora-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/lora/lora-italic-variable.woff2"),
    ),
    (
        "kp/fonts/lora/lora-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/lora/lora-variable.woff2"),
    ),
    (
        "kp/fonts/markazitext/markazitext-variable-arabic.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/markazitext/markazitext-variable-arabic.woff2"),
    ),
    (
        "kp/fonts/markazitext/markazitext-variable-latin.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/markazitext/markazitext-variable-latin.woff2"),
    ),
    (
        "kp/fonts/michroma/michroma-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/michroma/michroma-regular.woff2"),
    ),
    (
        "kp/fonts/orbitron/orbitron-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/orbitron/orbitron-variable.woff2"),
    ),
    (
        "kp/fonts/pixelifysans/pixelifysans-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/pixelifysans/pixelifysans-variable.woff2"),
    ),
    (
        "kp/fonts/poiretone/poiretone-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/poiretone/poiretone-regular.woff2"),
    ),
    (
        "kp/fonts/rajdhani/rajdhani-bold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/rajdhani/rajdhani-bold.woff2"),
    ),
    (
        "kp/fonts/rajdhani/rajdhani-medium.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/rajdhani/rajdhani-medium.woff2"),
    ),
    (
        "kp/fonts/rajdhani/rajdhani-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/rajdhani/rajdhani-regular.woff2"),
    ),
    (
        "kp/fonts/rajdhani/rajdhani-semibold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/rajdhani/rajdhani-semibold.woff2"),
    ),
    (
        "kp/fonts/sharetechmono/sharetechmono-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/sharetechmono/sharetechmono-regular.woff2"),
    ),
    (
        "kp/fonts/shipporimincho/shipporimincho-bold-japanese.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/shipporimincho/shipporimincho-bold-japanese.woff2"),
    ),
    (
        "kp/fonts/shipporimincho/shipporimincho-bold-latin.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/shipporimincho/shipporimincho-bold-latin.woff2"),
    ),
    (
        "kp/fonts/shipporimincho/shipporimincho-regular-japanese.woff2",
        "font/woff2",
        include_bytes!(
            "../../static/kp/fonts/shipporimincho/shipporimincho-regular-japanese.woff2"
        ),
    ),
    (
        "kp/fonts/shipporimincho/shipporimincho-regular-latin.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/shipporimincho/shipporimincho-regular-latin.woff2"),
    ),
    (
        "kp/fonts/sourcesans3/sourcesans3-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/sourcesans3/sourcesans3-italic-variable.woff2"),
    ),
    (
        "kp/fonts/sourcesans3/sourcesans3-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/sourcesans3/sourcesans3-variable.woff2"),
    ),
    (
        "kp/fonts/sourceserif4/sourceserif4-italic-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/sourceserif4/sourceserif4-italic-variable.woff2"),
    ),
    (
        "kp/fonts/sourceserif4/sourceserif4-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/sourceserif4/sourceserif4-variable.woff2"),
    ),
    (
        "kp/fonts/spacegrotesk/spacegrotesk-variable.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/spacegrotesk/spacegrotesk-variable.woff2"),
    ),
    (
        "kp/fonts/titilliumweb/titilliumweb-bold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/titilliumweb/titilliumweb-bold.woff2"),
    ),
    (
        "kp/fonts/titilliumweb/titilliumweb-italic.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/titilliumweb/titilliumweb-italic.woff2"),
    ),
    (
        "kp/fonts/titilliumweb/titilliumweb-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/titilliumweb/titilliumweb-regular.woff2"),
    ),
    (
        "kp/fonts/titilliumweb/titilliumweb-semibold.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/titilliumweb/titilliumweb-semibold.woff2"),
    ),
    (
        "kp/fonts/vazirmatn/vazirmatn-variable-arabic.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/vazirmatn/vazirmatn-variable-arabic.woff2"),
    ),
    (
        "kp/fonts/vazirmatn/vazirmatn-variable-latin.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/vazirmatn/vazirmatn-variable-latin.woff2"),
    ),
    (
        "kp/fonts/vt323/vt323-regular.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/vt323/vt323-regular.woff2"),
    ),
    (
        "kp/fonts/zenkakugothicnew/zenkakugothicnew-bold-japanese.woff2",
        "font/woff2",
        include_bytes!(
            "../../static/kp/fonts/zenkakugothicnew/zenkakugothicnew-bold-japanese.woff2"
        ),
    ),
    (
        "kp/fonts/zenkakugothicnew/zenkakugothicnew-bold-latin.woff2",
        "font/woff2",
        include_bytes!("../../static/kp/fonts/zenkakugothicnew/zenkakugothicnew-bold-latin.woff2"),
    ),
    (
        "kp/fonts/zenkakugothicnew/zenkakugothicnew-regular-japanese.woff2",
        "font/woff2",
        include_bytes!(
            "../../static/kp/fonts/zenkakugothicnew/zenkakugothicnew-regular-japanese.woff2"
        ),
    ),
    (
        "kp/fonts/zenkakugothicnew/zenkakugothicnew-regular-latin.woff2",
        "font/woff2",
        include_bytes!(
            "../../static/kp/fonts/zenkakugothicnew/zenkakugothicnew-regular-latin.woff2"
        ),
    ),
    (
        "chassis.css",
        "text/css; charset=utf-8",
        include_bytes!("../../static/chassis.css"),
    ),
    (
        "chassis.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/chassis.js"),
    ),
    (
        "passkeys.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/passkeys.js"),
    ),
    (
        "theme-boot.js",
        "text/javascript; charset=utf-8",
        include_bytes!("../../static/theme-boot.js"),
    ),
];

/// The vendored manifest, for the gate test and `--print-config`'s
/// "built with kp-themes x.y.z" line.
pub const KP_THEMES_MANIFEST: &str = include_str!("../../static/kp/KP_THEMES.sha256");

/// FNV-1a over every asset, as the `?v=` cache-buster: any byte changed in
/// any file changes every URL, which is what makes a one-year
/// `immutable` cache safe.
pub fn asset_version() -> &'static str {
    static VERSION: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    VERSION.get_or_init(|| fnv_version(ASSETS.iter().map(|(name, _, body)| (*name, *body))))
}

/// FNV-1a over `(name, body)` pairs, 16 hex chars.
pub fn fnv_version<'a>(parts: impl Iterator<Item = (&'a str, &'a [u8])>) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for (name, body) in parts {
        for b in name.bytes().chain(body.iter().copied()) {
            h ^= b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    format!("{h:016x}")
}

/// `GET /static/{name}`.
pub async fn serve(Path(name): Path<String>, RawQuery(query): RawQuery) -> Response {
    // The layout links every asset with `?v=<content hash>`, so those URLs
    // may be cached for a year. Fonts are reached from inside fonts.css
    // without the hash; a kp-themes bump can change them under the same
    // name, so those get a day.
    let versioned = query.as_deref().is_some_and(|q| q.contains("v="));
    let cache = if versioned {
        "public, max-age=31536000, immutable"
    } else {
        "public, max-age=86400"
    };
    match ASSETS.iter().find(|(n, _, _)| *n == name) {
        Some((_, ct, body)) => (
            [(header::CONTENT_TYPE, *ct), (header::CACHE_CONTROL, cache)],
            *body,
        )
            .into_response(),
        None => (StatusCode::NOT_FOUND, "no such asset").into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    /// K15 gate: every vendored copy matches the recorded release hash —
    /// the embedded files against the bytes the binary carries, the rest of
    /// the vendored tree (font licences, `families.json`) against the file
    /// on disk, so the whole tree is the tag it claims.
    #[test]
    fn vendored_kp_themes_match_the_manifest() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("static/kp");
        let mut checked = 0;
        let mut embedded = 0;
        for line in KP_THEMES_MANIFEST.lines() {
            if line.starts_with('#') || line.trim().is_empty() {
                continue;
            }
            let (hash, name) = line.split_once("  ").expect("sha256sum line");
            let key = format!("kp/{name}");
            let actual = match ASSETS.iter().find(|(n, _, _)| *n == key) {
                Some((_, _, body)) => {
                    embedded += 1;
                    hex::encode(Sha256::digest(body))
                }
                None => {
                    let bytes = std::fs::read(root.join(name))
                        .unwrap_or_else(|e| panic!("manifest names {name}, missing on disk: {e}"));
                    assert!(
                        !name.ends_with(".css")
                            && !name.ends_with(".js")
                            && !name.ends_with(".woff2"),
                        "{name} is a served kind of file but not embedded"
                    );
                    hex::encode(Sha256::digest(bytes))
                }
            };
            assert_eq!(
                actual, hash,
                "{name} differs from kp-themes v{KP_THEMES_VERSION}"
            );
            checked += 1;
        }
        let kp_assets = ASSETS
            .iter()
            .filter(|(n, _, _)| n.starts_with("kp/"))
            .count();
        assert_eq!(
            embedded, kp_assets,
            "every embedded kp/ asset is in the manifest and vice versa"
        );
        assert!(
            checked >= embedded,
            "the manifest covers at least the embedded files"
        );
        assert!(
            KP_THEMES_MANIFEST
                .lines()
                .next()
                .is_some_and(|l| l.contains(&format!("v{KP_THEMES_VERSION}"))),
            "the manifest's first line names the vendored version (the CLI reads it there)"
        );
    }

    /// K15: the vendored JavaScript is a closed import graph. One `import`
    /// pointing at a module the binary does not carry is a 404 that takes
    /// the whole module graph down — picker, confirmations, skip links.
    /// kp-themes' own `gates/check-closure.mjs` guards the six modules it
    /// knows this consumer bakes; this guards whatever the kit bakes,
    /// effects.js included. Drilled red once by dropping `kp/js/strings.js`
    /// from ASSETS: failed, restored.
    #[test]
    fn vendored_javascript_imports_only_vendored_modules() {
        let js: Vec<(&str, &str)> = ASSETS
            .iter()
            .filter(|(n, _, _)| n.ends_with(".js"))
            .map(|(n, _, b)| (*n, std::str::from_utf8(b).expect("utf-8")))
            .collect();
        assert!(js.iter().any(|(n, _)| *n == "kp/js/effects.js"));
        let mut checked = 0;
        for (name, body) in &js {
            let dir = name.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
            for line in body.lines() {
                let line = line.trim();
                if !line.starts_with("import ") && !line.starts_with("export ") {
                    continue;
                }
                let Some(from) = line.split(" from ").nth(1) else {
                    continue;
                };
                let target = from.trim().trim_end_matches(';').trim_matches(['\'', '"']);
                let Some(rel) = target.strip_prefix("./") else {
                    panic!("{name} imports {target}: only ./ imports are servable");
                };
                let key = if dir.is_empty() {
                    rel.to_string()
                } else {
                    format!("{dir}/{rel}")
                };
                assert!(
                    ASSETS.iter().any(|(n, _, _)| *n == key),
                    "{name} imports {target}, which the binary does not serve"
                );
                checked += 1;
            }
        }
        assert!(
            checked >= 8,
            "the module graph has imports to check ({checked})"
        );
    }

    #[test]
    fn version_hash_is_stable_and_changes_with_content() {
        assert_eq!(asset_version().len(), 16);
        assert_eq!(asset_version(), asset_version());
        let a = fnv_version([("chassis.css", b"body{}" as &[u8])].into_iter());
        let b = fnv_version([("chassis.css", b"body{ }" as &[u8])].into_iter());
        let c = fnv_version([("other.css", b"body{}" as &[u8])].into_iter());
        assert_ne!(a, b, "one byte in a body changes every URL");
        assert_ne!(a, c, "a renamed asset changes every URL");
        assert_eq!(
            a,
            fnv_version([("chassis.css", b"body{}" as &[u8])].into_iter())
        );
    }

    #[tokio::test]
    async fn serve_sets_immutable_cache_and_404s_unknown() {
        let versioned = RawQuery(Some("v=0123456789abcdef".into()));
        let res = serve(Path("chassis.css".into()), versioned).await;
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(
            res.headers()["cache-control"],
            "public, max-age=31536000, immutable"
        );
        // A font reached from inside fonts.css carries no hash: a day, not a year.
        let res = serve(
            Path("kp/fonts/instrumentsans/instrumentsans-variable.woff2".into()),
            RawQuery(None),
        )
        .await;
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(res.headers()["cache-control"], "public, max-age=86400");
        assert_eq!(res.headers()["content-type"], "font/woff2");
        assert_eq!(
            serve(Path("../etc/passwd".into()), RawQuery(None))
                .await
                .status(),
            StatusCode::NOT_FOUND
        );
    }
}
