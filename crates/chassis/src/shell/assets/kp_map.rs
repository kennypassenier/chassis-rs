//! Option A (proto-kp-shape-1): one kp-themes runtime per page through an
//! import map. Every split entry URL (`/static/kp/dist/js/<entry>.js`, with
//! and without the kit's `?v=`) and the top-level `/static/kp/js/<x>.js`
//! modules resolve to the self-contained bundle, so a page makes one request
//! for kp-themes and holds one copy of its state.
//!
//! The map is an inline `<script type="importmap">`: browsers do not load an
//! external one. CSP therefore gets that script's `sha256-…` source in
//! `script-src` (a hash, not a nonce, because the text is identical on every
//! response of one build, so pages stay cacheable and `'unsafe-inline'`
//! never appears).
//!
//! Import maps rewrite `import` specifiers (static and dynamic, relative ones
//! after they resolve to a URL) but NOT `<script src>`: the boot entry is
//! therefore also served as a one-line module over the bundle (build.rs).

use std::sync::OnceLock;

use base64::Engine as _;
use sha2::{Digest, Sha256};

use super::{all_assets, asset_version, fnv_version};

const BUNDLE: &str = "kp/dist/kp-themes.min.js";

/// Top-level `kp/js/<x>.js` modules that export a name the bundle lacks
/// (measured with an esbuild metafile, 12.4.0); mapping them would turn an
/// import of that name into a SyntaxError, so they stay unmapped.
const NOT_IN_BUNDLE: &[&str] = &[
    "accept-follows-words",
    "accept-follows",
    "actions",
    "as-of",
    "boot-guard",
    "combobox",
    "controller",
    "datatable",
    "datepicker",
    "live-say",
    "locale",
    "motion",
    "overlays",
    "palette",
    "progressbar",
    "quantity",
    "realm",
    "row-select",
    "strings-nl",
    "structure",
    "top-layer",
    "upload",
];

/// The bundle's URL with a content hash: the one URL every mapped import
/// ends at, cached for a year.
pub fn bundle_url() -> &'static str {
    static URL: OnceLock<String> = OnceLock::new();
    URL.get_or_init(|| {
        let body = all_assets()
            .find(|(n, _, _)| *n == BUNDLE)
            .map_or(&[][..], |(_, _, b)| *b);
        format!(
            "/static/{BUNDLE}?v={}",
            fnv_version(std::iter::once(("", body)))
        )
    })
}

fn mapped(name: &str) -> bool {
    if let Some(n) = name.strip_prefix("kp/dist/js/") {
        return n.ends_with(".js") && !n.contains('/') && !n.starts_with("chunk-");
    }
    name.strip_prefix("kp/js/")
        .and_then(|n| n.strip_suffix(".js"))
        .is_some_and(|n| !n.contains('/') && !NOT_IN_BUNDLE.contains(&n))
}

/// The map as JSON.
fn map_json() -> String {
    let (target, v) = (bundle_url(), asset_version());
    let mut imports = serde_json::Map::new();
    imports.insert(format!("/static/{BUNDLE}"), target.into());
    for (name, _, _) in all_assets().filter(|(n, _, _)| mapped(n)) {
        imports.insert(format!("/static/{name}"), target.into());
        imports.insert(format!("/static/{name}?v={v}"), target.into());
    }
    serde_json::json!({ "imports": imports }).to_string()
}

/// `(tag, script-src hash source)`: the tag to put before the first module
/// script, and the CSP source that allows exactly that text.
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
pub fn tag() -> &'static str {
    &built().0
}

/// `csp` with the map's hash added to `script-src 'self'`; `None` when the
/// policy has no such source (a custom policy: the map is then not injected).
pub fn csp_with_hash(csp: &str) -> Option<String> {
    let hash = &built().1;
    if csp.contains(hash.as_str()) {
        return Some(csp.to_string());
    }
    csp.contains("script-src 'self'")
        .then(|| csp.replacen("script-src 'self'", &format!("script-src 'self' {hash}"), 1))
}
