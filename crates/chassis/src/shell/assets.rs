//! Static assets (K15): the vendored @kp-soft/themes files and the kit's
//! own CSS/JS, embedded with `include_str!` and served under a
//! content-hash query so browsers may cache them for a year.
//!
//! The vendored files are byte-for-byte copies of the kp-themes release
//! named in `static/kp/KP_THEMES.sha256`; a test below compares every
//! copy against that manifest, so a stray edit or a half-done bump fails
//! the gates offline (kyu's rule). Bumping kp-themes = re-copy the eight
//! files, refresh the manifest, run the tests.

use axum::extract::Path;
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};

/// The kp-themes version the kit vendors (C3: one place).
pub const KP_THEMES_VERSION: &str = "3.1.0";

/// name → (content type, bytes). Explicit list, no path joining (kyu's
/// traversal-proof shape).
pub const ASSETS: &[(&str, &str, &str)] = &[
    (
        "themes.css",
        "text/css; charset=utf-8",
        include_str!("../../static/kp/themes.css"),
    ),
    (
        "components.css",
        "text/css; charset=utf-8",
        include_str!("../../static/kp/components.css"),
    ),
    (
        "theme-core.js",
        "text/javascript; charset=utf-8",
        include_str!("../../static/kp/theme-core.js"),
    ),
    (
        "theme-picker.js",
        "text/javascript; charset=utf-8",
        include_str!("../../static/kp/theme-picker.js"),
    ),
    (
        "theme-registry.js",
        "text/javascript; charset=utf-8",
        include_str!("../../static/kp/theme-registry.js"),
    ),
    (
        "no-flash.js",
        "text/javascript; charset=utf-8",
        include_str!("../../static/kp/no-flash.js"),
    ),
    (
        "components.js",
        "text/javascript; charset=utf-8",
        include_str!("../../static/kp/components.js"),
    ),
    (
        "strings.js",
        "text/javascript; charset=utf-8",
        include_str!("../../static/kp/strings.js"),
    ),
    (
        "chassis.css",
        "text/css; charset=utf-8",
        include_str!("../../static/chassis.css"),
    ),
    (
        "chassis.js",
        "text/javascript; charset=utf-8",
        include_str!("../../static/chassis.js"),
    ),
    (
        "passkeys.js",
        "text/javascript; charset=utf-8",
        include_str!("../../static/passkeys.js"),
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
    VERSION.get_or_init(|| {
        fnv_version(
            ASSETS
                .iter()
                .map(|(name, _, body)| (*name, body.as_bytes())),
        )
    })
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
pub async fn serve(Path(name): Path<String>) -> Response {
    match ASSETS.iter().find(|(n, _, _)| *n == name) {
        Some((_, ct, body)) => (
            [
                (header::CONTENT_TYPE, *ct),
                (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
            ],
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

    /// K15 gate: every vendored copy matches the recorded release hash.
    #[test]
    fn vendored_kp_themes_match_the_manifest() {
        let mut checked = 0;
        for line in KP_THEMES_MANIFEST.lines() {
            if line.starts_with('#') || line.trim().is_empty() {
                continue;
            }
            let (hash, name) = line.split_once("  ").expect("sha256sum line");
            let (_, _, body) = ASSETS
                .iter()
                .find(|(n, _, _)| *n == name)
                .unwrap_or_else(|| panic!("manifest names {name}, which is not embedded"));
            let actual = hex::encode(Sha256::digest(body.as_bytes()));
            assert_eq!(
                actual, hash,
                "{name} differs from kp-themes v{KP_THEMES_VERSION}"
            );
            checked += 1;
        }
        assert_eq!(checked, 8, "the manifest lists the eight vendored files");
        assert!(KP_THEMES_MANIFEST.contains(&format!("v{KP_THEMES_VERSION}")));
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
        let res = serve(Path("chassis.css".into())).await;
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(
            res.headers()["cache-control"],
            "public, max-age=31536000, immutable"
        );
        assert_eq!(
            serve(Path("../etc/passwd".into())).await.status(),
            StatusCode::NOT_FOUND
        );
    }
}
