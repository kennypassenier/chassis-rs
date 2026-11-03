//! One kp-themes runtime per page, through an import map.
//!
//! kp-themes 12.6 ships `dist/bundle/<entry>.js`: one generated facade per
//! split entry that re-exports exactly that entry's names from the one-file
//! bundle. The map below sends every import of a split entry
//! (`/static/kp/dist/js/<entry>.js`, with or without a `?v=`, static or
//! dynamic, relative specifiers after they resolve) to the facade of the same
//! name, and the bundle's own URL to its content-hashed form. A page then
//! requests the bundle once, holds one copy of its state, and cannot load the
//! split modules by import.
//!
//! The map is an inline `<script type="importmap">`: browsers do not load an
//! external one. CSP gets that script's `sha256-…` source in `script-src`,
//! a hash and not a nonce, because the text is identical on every response of
//! one build (pages stay cacheable) and `'unsafe-inline'` never appears.
//!
//! What a map cannot do: rewrite `<script src>` (the layout and the web-app
//! injection name the boot facade directly), match an app's own `?v=` on the
//! bundle URL, or exist on a page that carries an import map of its own or a
//! policy without `script-src 'self'`; `webapp::import_map` leaves such a
//! page unmapped and says so.

use std::sync::OnceLock;

use base64::Engine as _;
use sha2::{Digest, Sha256};

use super::{BUNDLE_FACADE_PREFIX, KP_BUNDLE_NAME, SPLIT_PREFIX, all_assets, fnv_version};

/// The one split entry without a facade: it re-exports everything, which is
/// what the bundle is, so it maps to the bundle itself.
const INDEX_ENTRY: &str = "index.js";

/// The bundle's URL (no query): what the facades import and what apps import.
fn bundle_plain() -> String {
    format!("/static/{KP_BUNDLE_NAME}")
}

/// The bundle's content-hashed URL: the one URL every import ends at, cached
/// for a year (`serve_conditional` answers a `?v=` immutable).
pub fn bundle_url() -> &'static str {
    static URL: OnceLock<String> = OnceLock::new();
    URL.get_or_init(|| {
        let body = all_assets()
            .find(|(n, _, _)| *n == KP_BUNDLE_NAME)
            .map_or(&[][..], |(_, _, b)| *b);
        format!(
            "{}?v={}",
            bundle_plain(),
            fnv_version(std::iter::once(("", body)))
        )
    })
}

/// The map as JSON. The longest key wins, so the two exact keys beat the
/// prefix.
fn map_json() -> String {
    let mut imports = serde_json::Map::new();
    imports.insert(SPLIT_PREFIX.into(), BUNDLE_FACADE_PREFIX.into());
    imports.insert(format!("{SPLIT_PREFIX}{INDEX_ENTRY}"), bundle_url().into());
    imports.insert(bundle_plain(), bundle_url().into());
    serde_json::json!({ "imports": imports }).to_string()
}

/// `(tag, script-src hash source)`.
fn built() -> &'static (String, String) {
    static BUILT: OnceLock<(String, String)> = OnceLock::new();
    BUILT.get_or_init(|| {
        let json = map_json();
        let digest = Sha256::digest(json.as_bytes());
        let hash = base64::engine::general_purpose::STANDARD.encode(digest);
        (
            format!("<script type=\"importmap\">{json}</script>"),
            format!("'sha256-{hash}'"),
        )
    })
}

/// The `<script type="importmap">` tag (one line, no trailing newline).
#[cfg_attr(not(feature = "dashboard"), allow(dead_code))]
pub fn tag() -> &'static str {
    &built().0
}

/// Whether `csp` can take the map's hash: it has a `script-src 'self'`.
pub fn csp_accepts_map(csp: &str) -> bool {
    csp.contains("script-src 'self'")
}

/// `csp` with the map's hash added to `script-src 'self'`; `None` when the
/// policy has no such source (a custom policy).
pub fn csp_with_hash(csp: &str) -> Option<String> {
    let hash = &built().1;
    if csp.contains(hash.as_str()) {
        return Some(csp.to_string());
    }
    csp_accepts_map(csp)
        .then(|| csp.replacen("script-src 'self'", &format!("script-src 'self' {hash}"), 1))
}
