//! Locks the installable web app (feat-webapp-4): the manifest, the public
//! worker and icons, the tags in the pages, and the opt-out.

use super::pwa::icons;
use super::tests::{body, get_path};
use super::*;
use axum::Router;

const PAGE: &[u8] = b"<!doctype html><html><head><title>a</title></head><body>x</body></html>";
const HAS_ALL: &[u8] = b"<html><head><link rel='manifest' href='/mine.json'>\
<META NAME=\"theme-color\" content=\"red\"><link rel=\"apple-touch-icon\" href=\"/t.png\"></head></html>";
/// A valid 1x1 PNG signature plus junk: enough to count as "the app's own icon".
const OWN_ICON: &[u8] = b"\x89PNG\r\n\x1a\nOWN";
const FILES: &[(&str, &[u8])] = &[
    ("index.html", PAGE),
    ("all.html", HAS_ALL),
    ("pwa/icon-192.png", OWN_ICON),
    ("pwa/icon-512.png", b"not a png"),
];

/// The app's routes with the public install routes merged, as the mount does.
fn routes(app: WebApp) -> Router {
    let public = app.pwa_router("Medicine Cabinet").expect("installable");
    public.merge(app.router().unwrap())
}

async fn bytes(r: &Router, path: &str) -> (axum::http::response::Parts, Vec<u8>) {
    let (parts, b) = get_path(r, path, &[]).await.into_parts();
    (
        parts,
        axum::body::to_bytes(b, 1 << 20).await.unwrap().to_vec(),
    )
}

#[tokio::test]
async fn the_manifest_describes_an_installable_app() {
    let r = routes(WebApp::embedded(FILES));
    let (parts, raw) = bytes(&r, "/manifest.webmanifest").await;
    assert_eq!(parts.status, 200);
    assert_eq!(parts.headers["content-type"], "application/manifest+json");
    assert_eq!(parts.headers["cache-control"], "no-cache");
    let m: serde_json::Value = serde_json::from_slice(&raw).unwrap();
    assert_eq!(m["name"], "Medicine Cabinet");
    assert_eq!(m["short_name"], "Medicine Cab");
    assert_eq!(
        (m["start_url"].as_str(), m["scope"].as_str()),
        (Some("/"), Some("/"))
    );
    assert_eq!(m["display"], "standalone");
    assert_eq!(m["theme_color"], "#223659");
    assert_eq!(m["background_color"], "#faf8f5");
    let icons = m["icons"].as_array().unwrap();
    let find = |sizes: &str, purpose: &str| {
        icons
            .iter()
            .any(|i| i["sizes"] == sizes && i["purpose"] == purpose && i["type"] == "image/png")
    };
    assert!(find("192x192", "any") && find("512x512", "any") && find("512x512", "maskable"));
}

#[tokio::test]
async fn the_manifest_follows_the_settings() {
    let pwa = Pwa::new()
        .name("Meds")
        .short_name("M")
        .description("Pills")
        .display(Display::Fullscreen)
        .theme_color("#112233")
        .background_color("white");
    let r = routes(WebApp::embedded(FILES).pwa(pwa));
    let m: serde_json::Value =
        serde_json::from_str(&body(get_path(&r, "/manifest.webmanifest", &[]).await).await)
            .unwrap();
    assert_eq!(m["name"], "Meds");
    assert_eq!(m["short_name"], "M");
    assert_eq!(m["description"], "Pills");
    assert_eq!(m["display"], "fullscreen");
    assert_eq!(m["theme_color"], "#112233");
    assert_eq!(m["background_color"], "white");
}

#[tokio::test]
async fn the_worker_is_served_from_the_root_and_never_kept_by_the_http_cache() {
    let r = routes(WebApp::embedded(FILES));
    let (parts, raw) = bytes(&r, "/sw.js").await;
    assert_eq!(parts.status, 200);
    assert_eq!(
        parts.headers["content-type"],
        "text/javascript; charset=utf-8"
    );
    assert_eq!(parts.headers["cache-control"], "no-cache");
    let js = String::from_utf8(raw).unwrap();
    assert!(js.starts_with("const KIT_VERSION = \""), "{}", &js[..60]);
    assert!(js.contains(crate::shell::assets::asset_version()));
    assert!(js.contains("addEventListener('fetch'"));
    // The same app yields the same bytes; a changed app yields other bytes.
    assert_eq!(js, body(get_path(&r, "/sw.js", &[]).await).await);
    const OTHER: &[(&str, &[u8])] = &[("index.html", b"<!doctype html><title>b</title>")];
    let other = body(get_path(&routes(WebApp::embedded(OTHER)), "/sw.js", &[]).await).await;
    assert_ne!(js, other, "the web app's build is part of the worker");
}

#[tokio::test]
async fn the_offline_page_and_its_script_are_public_and_kit_styled() {
    let r = routes(WebApp::embedded(FILES));
    let html = body(get_path(&r, "/pwa/offline", &[]).await).await;
    assert!(html.contains("You are offline") && html.contains("kp-themes.css?v="));
    assert!(
        !html.contains("<script>"),
        "no inline script: the CSP is script-src 'self'"
    );
    let (parts, _) = bytes(&r, "/pwa/offline.js").await;
    assert_eq!(parts.status, 200);
}

/// Width and height from the PNG header.
fn dims(png: &[u8]) -> (u32, u32) {
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    assert_eq!(&png[12..16], b"IHDR");
    let n = |at: usize| u32::from_be_bytes(png[at..at + 4].try_into().unwrap());
    (n(16), n(20))
}

#[tokio::test]
async fn the_default_icons_are_png_of_the_right_size() {
    let r = routes(WebApp::embedded(FILES));
    for (path, side) in [
        ("/pwa/icon-180.png", 180),
        ("/pwa/icon-maskable-512.png", 512),
    ] {
        let (parts, png) = bytes(&r, path).await;
        assert_eq!(parts.headers["content-type"], "image/png", "{path}");
        assert_eq!(dims(&png), (side, side), "{path}");
    }
    // A broken file of the app is not served as a PNG: the generated icon is.
    let (_, png) = bytes(&r, "/pwa/icon-512.png").await;
    assert_eq!(dims(&png), (512, 512));
}

#[tokio::test]
async fn an_icon_file_of_the_app_replaces_the_generated_one() {
    let r = routes(WebApp::embedded(FILES));
    let (parts, png) = bytes(&r, "/pwa/icon-192.png").await;
    assert_eq!(parts.status, 200);
    assert_eq!(png, OWN_ICON);
}

#[tokio::test]
async fn pages_get_each_tag_once_and_keep_their_own() {
    let r = WebApp::embedded(FILES).router().unwrap();
    let html = body(get_path(&r, "/", &[]).await).await;
    for needle in [
        "rel=\"manifest\"",
        "name=\"theme-color\"",
        "rel=\"apple-touch-icon\"",
    ] {
        assert_eq!(html.matches(needle).count(), 1, "{needle}: {html}");
    }
    assert!(
        html.contains("content=\"#223659\"") && html.contains("href=\"/manifest.webmanifest\"")
    );
    assert!(html.find("manifest").unwrap() < html.find("</head>").unwrap());
    // The client-route fallback is the same page.
    assert_eq!(
        body(get_path(&r, "/stacks/media", &[]).await)
            .await
            .matches("rel=\"manifest\"")
            .count(),
        1
    );
    // A page with all three keeps its own and gains none.
    let own = body(get_path(&r, "/all.html", &[]).await).await;
    assert_eq!(own.matches("manifest").count(), 1, "{own}");
    assert_eq!(own.matches("theme-color").count(), 1);
    assert_eq!(own.matches("apple-touch-icon").count(), 1);
}

#[tokio::test]
async fn without_pwa_nothing_is_served_and_nothing_injected() {
    let app = WebApp::embedded(FILES).without_pwa();
    assert!(app.pwa_router("X").is_none() && app.pwa_head_html().is_none());
    let r = app.router().unwrap();
    for path in ["/manifest.webmanifest", "/sw.js"] {
        // The app's fallback answers a path with an extension as a missing file.
        assert_eq!(get_path(&r, path, &[]).await.status(), 404, "{path}");
    }
    let html = body(get_path(&r, "/", &[]).await).await;
    assert!(
        !html.contains("manifest")
            && !html.contains("theme-color")
            && !html.contains("apple-touch")
    );
    assert!(
        html.contains("webapp-runtime.js"),
        "the runtime is independent of the PWA"
    );
}

#[tokio::test]
async fn no_kit_runtime_is_not_installable() {
    // The runtime registers the worker, so an app without it cannot install.
    assert!(
        WebApp::embedded(FILES)
            .without_kit_runtime()
            .pwa_router("X")
            .is_none()
    );
}

#[test]
fn a_colour_that_could_break_out_of_the_attribute_is_refused() {
    let bad = WebApp::embedded(FILES).pwa(Pwa::new().theme_color("red\"><script>"));
    assert!(
        bad.validate()
            .unwrap_err()
            .to_string()
            .contains("theme_color")
    );
    assert!(
        WebApp::embedded(FILES)
            .pwa(Pwa::new().theme_color("rgb(1, 2, 3)"))
            .validate()
            .is_ok()
    );
}

#[test]
fn every_glyph_is_five_by_seven() {
    for c in ('A'..='Z').chain('0'..='9') {
        let png = icons::default_icon(64, Some(c), "#223659", "#faf8f5");
        assert_eq!(dims(&png), (64, 64));
    }
    assert_eq!(icons::initial("  medicine"), Some('M'));
    assert_eq!(icons::initial("--"), None);
}
