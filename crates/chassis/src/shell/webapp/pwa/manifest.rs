//! The web app manifest: the JSON a browser reads to offer the install.

use serde_json::{Value, json};

use super::Pwa;
use super::routes::{
    ICON_192_PATH, ICON_512_PATH, ICON_MASKABLE_192_PATH, ICON_MASKABLE_PATH, ICON_MONOCHROME_PATH,
};

/// The name under the home-screen icon: the configured one, else the name
/// cut at 12 characters (what Android shows without clipping).
pub(super) fn short_name(pwa: &Pwa, name: &str) -> String {
    match &pwa.short_name {
        Some(s) => s.clone(),
        None => name.chars().take(12).collect::<String>().trim().to_string(),
    }
}

/// The manifest for an app called `name`. `start_url` and `scope` are the
/// root: PWA support only exists for an app at the root.
pub(super) fn manifest(pwa: &Pwa, name: &str) -> Value {
    let mut m = json!({
        "id": "/",
        "name": name,
        "short_name": short_name(pwa, name),
        "start_url": "/",
        "scope": "/",
        "display": pwa.display.as_str(),
        "theme_color": pwa.theme_color,
        "background_color": pwa.background_color,
        "icons": [
            {"src": ICON_192_PATH, "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": ICON_512_PATH, "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": ICON_MASKABLE_192_PATH, "sizes": "192x192", "type": "image/png", "purpose": "maskable"},
            {"src": ICON_MASKABLE_PATH, "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
            {"src": ICON_MONOCHROME_PATH, "sizes": "512x512", "type": "image/png", "purpose": "monochrome"},
        ],
    });
    if let Some(d) = &pwa.description {
        m["description"] = json!(d);
    }
    super::fields::extend(&mut m, &pwa.fields);
    super::extras::extend(&mut m, &pwa.shortcuts, pwa.share_target.as_ref());
    m
}
