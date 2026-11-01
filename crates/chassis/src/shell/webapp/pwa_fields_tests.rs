//! Locks the manifest fields that are written only when set (Habits,
//! 2026-11-01), the two extra icons, the shortcut icon and its public route,
//! and the update policy carried on the manifest link.

use super::pwa::icons;
use super::tests::{body, get_path};
use super::*;
use axum::Router;

const PAGE: &[u8] = b"<html><head></head><body>x</body></html>";
const SHORTCUT_ICON: &[u8] = b"\x89PNG\r\n\x1a\nSHORTCUT";
const FILES: &[(&str, &[u8])] = &[
    ("index.html", PAGE),
    ("img/inbox-96.png", SHORTCUT_ICON),
    ("img/broken-96.png", b"not a png"),
];

fn routes(pwa: Pwa) -> Router {
    let app = WebApp::embedded(FILES).pwa(pwa);
    app.pwa_router("Habits")
        .expect("installable")
        .merge(app.router().unwrap())
}

async fn manifest(pwa: Pwa) -> serde_json::Value {
    let r = routes(pwa);
    serde_json::from_str(&body(get_path(&r, "/manifest.webmanifest", &[]).await).await).unwrap()
}

async fn png(r: &Router, path: &str) -> (u16, Vec<u8>) {
    let (parts, b) = get_path(r, path, &[]).await.into_parts();
    let bytes = axum::body::to_bytes(b, 1 << 20).await.unwrap().to_vec();
    (parts.status.as_u16(), bytes)
}

#[tokio::test]
async fn fields_that_are_not_set_are_not_written() {
    let m = manifest(Pwa::new()).await;
    for key in [
        "categories",
        "orientation",
        "lang",
        "dir",
        "display_override",
        "launch_handler",
    ] {
        assert!(m.get(key).is_none(), "{key} must be absent: {m}");
    }
}

#[tokio::test]
async fn each_field_lands_in_the_manifest_with_the_spec_spelling() {
    let m = manifest(
        Pwa::new()
            .categories(&["productivity", "health"])
            .orientation(Orientation::PortraitPrimary)
            .lang("nl-BE")
            .dir(Dir::Auto)
            .display_override(&[Display::Fullscreen, Display::MinimalUi])
            .launch_handler(ClientMode::NavigateExisting),
    )
    .await;
    assert_eq!(
        m["categories"],
        serde_json::json!(["productivity", "health"])
    );
    assert_eq!(m["orientation"], "portrait-primary");
    assert_eq!(m["lang"], "nl-BE");
    assert_eq!(m["dir"], "auto");
    assert_eq!(
        m["display_override"],
        serde_json::json!(["fullscreen", "minimal-ui"])
    );
    assert_eq!(m["launch_handler"]["client_mode"], "navigate-existing");
    assert_eq!(m["display"], "standalone", "display stays the fallback");
}

#[test]
fn every_spelling_matches_the_manifest_spec() {
    let o = [
        (Orientation::Any, "any"),
        (Orientation::Natural, "natural"),
        (Orientation::Portrait, "portrait"),
        (Orientation::Landscape, "landscape"),
        (Orientation::PortraitPrimary, "portrait-primary"),
        (Orientation::LandscapePrimary, "landscape-primary"),
    ];
    for (v, s) in o {
        assert_eq!(v.as_str(), s);
    }
    for (v, s) in [(Dir::Ltr, "ltr"), (Dir::Rtl, "rtl"), (Dir::Auto, "auto")] {
        assert_eq!(v.as_str(), s);
    }
    let c = [
        (ClientMode::Auto, "auto"),
        (ClientMode::NavigateNew, "navigate-new"),
        (ClientMode::NavigateExisting, "navigate-existing"),
        (ClientMode::FocusExisting, "focus-existing"),
    ];
    for (v, s) in c {
        assert_eq!(v.as_str(), s);
    }
}

/// The IHDR size and, when present, the `tRNS` chunk of a generated icon.
fn header_and_trns(png: &[u8]) -> ((u32, u32), bool) {
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    let n = |at: usize| u32::from_be_bytes(png[at..at + 4].try_into().unwrap());
    ((n(16), n(20)), png.windows(4).any(|w| w == b"tRNS"))
}

#[tokio::test]
async fn the_manifest_lists_the_maskable_192_and_the_monochrome_icon() {
    let m = manifest(Pwa::new()).await;
    let icons = m["icons"].as_array().unwrap();
    let has = |src: &str, sizes: &str, purpose: &str| {
        icons.iter().any(|i| {
            i["src"] == src
                && i["sizes"] == sizes
                && i["purpose"] == purpose
                && i["type"] == "image/png"
        })
    };
    assert!(has("/pwa/icon-maskable-192.png", "192x192", "maskable"));
    assert!(has("/pwa/icon-monochrome-512.png", "512x512", "monochrome"));
    assert!(has("/pwa/icon-maskable-512.png", "512x512", "maskable"));
}

#[tokio::test]
async fn the_new_icons_are_public_pngs_of_the_right_size() {
    let r = routes(Pwa::new());
    let (status, mask) = png(&r, "/pwa/icon-maskable-192.png").await;
    assert_eq!(status, 200);
    assert_eq!(header_and_trns(&mask), ((192, 192), false));
    let (status, mono) = png(&r, "/pwa/icon-monochrome-512.png").await;
    assert_eq!(status, 200);
    assert_eq!(header_and_trns(&mono), ((512, 512), true));
}

#[test]
fn the_monochrome_icon_has_transparent_pixels_and_one_opaque_colour() {
    let mono = icons::monochrome_icon(64, Some('H'), "#223659");
    let (_, trns) = header_and_trns(&mono);
    assert!(trns, "a tRNS chunk makes palette entry 0 transparent");
    // Both palette entries carry the same colour, so every opaque pixel is
    // that colour; entry 0 (the ground) is alpha 0, entry 1 (the ink) 255.
    let at = mono.windows(4).position(|w| w == b"PLTE").unwrap() + 4;
    assert_eq!(mono[at..at + 3], mono[at + 3..at + 6]);
    assert_eq!(mono[at..at + 3], [0x22, 0x36, 0x59]);
    let t = mono.windows(4).position(|w| w == b"tRNS").unwrap() + 4;
    assert_eq!(mono[t..t + 2], [0, 255]);
    // Without a letter the icon is a plain disc, still on transparent.
    assert!(header_and_trns(&icons::monochrome_icon(64, None, "navy")).1);
}

#[tokio::test]
async fn a_file_of_the_app_replaces_either_new_icon() {
    const OWN: &[(&str, &[u8])] = &[
        ("index.html", PAGE),
        ("pwa/icon-maskable-192.png", b"\x89PNG\r\n\x1a\nMASK"),
        ("pwa/icon-monochrome-512.png", b"\x89PNG\r\n\x1a\nMONO"),
    ];
    let app = WebApp::embedded(OWN);
    let r = app.pwa_router("X").unwrap().merge(app.router().unwrap());
    assert_eq!(png(&r, "/pwa/icon-maskable-192.png").await.1, OWN[1].1);
    assert_eq!(png(&r, "/pwa/icon-monochrome-512.png").await.1, OWN[2].1);
}

#[tokio::test]
async fn a_shortcut_icon_is_in_the_manifest_and_served_without_a_login() {
    let pwa = Pwa::new()
        .shortcut(Shortcut::new("Inbox", "/inbox").icon("/img/inbox-96.png"))
        .shortcut(Shortcut::new("Plain", "/plain"));
    let r = routes(pwa);
    let m: serde_json::Value =
        serde_json::from_str(&body(get_path(&r, "/manifest.webmanifest", &[]).await).await)
            .unwrap();
    assert_eq!(
        m["shortcuts"][0]["icons"],
        serde_json::json!([{"src": "/img/inbox-96.png", "sizes": "96x96", "type": "image/png"}])
    );
    assert!(m["shortcuts"][1].get("icons").is_none());
    // Served by the public PWA router alone, i.e. outside any login layer.
    let app = WebApp::embedded(FILES)
        .pwa(Pwa::new().shortcut(Shortcut::new("Inbox", "/inbox").icon("/img/inbox-96.png")));
    let public = app.pwa_router("Habits").unwrap();
    assert_eq!(
        png(&public, "/img/inbox-96.png").await,
        (200, SHORTCUT_ICON.to_vec())
    );
}

#[tokio::test]
async fn a_missing_or_non_png_shortcut_icon_is_a_404_not_an_empty_image() {
    let pwa = Pwa::new()
        .shortcut(Shortcut::new("A", "/a").icon("/img/missing-96.png"))
        .shortcut(Shortcut::new("B", "/b").icon("/img/broken-96.png"));
    let app = WebApp::embedded(FILES).pwa(pwa);
    let public = app.pwa_router("Habits").unwrap();
    assert_eq!(png(&public, "/img/missing-96.png").await.0, 404);
    assert_eq!(png(&public, "/img/broken-96.png").await.0, 404);
}

#[test]
fn a_shortcut_icon_that_is_no_plain_png_path_is_refused() {
    for bad in [
        "icon.png",
        "https://x.test/a.png",
        "/a.jpg",
        "/a.png?v=1",
        "/../a.png",
    ] {
        let err = WebApp::embedded(FILES)
            .pwa(Pwa::new().shortcut(Shortcut::new("S", "/s").icon(bad)))
            .validate()
            .unwrap_err()
            .to_string();
        assert!(err.contains("shortcut icon"), "{bad}: {err}");
    }
}

#[tokio::test]
async fn the_update_policy_rides_on_the_manifest_link_only_for_ask() {
    let page = |pwa: Pwa| async move {
        let r = WebApp::embedded(FILES).pwa(pwa).router().unwrap();
        body(get_path(&r, "/", &[]).await).await
    };
    let auto = page(Pwa::new()).await;
    assert!(!auto.contains("data-chassis-reload"), "{auto}");
    let ask = page(Pwa::new().reload(Reload::Ask)).await;
    assert!(
        ask.contains(
            "<link rel=\"manifest\" href=\"/manifest.webmanifest\" data-chassis-reload=\"ask\">"
        ),
        "{ask}"
    );
    assert_eq!(ask.matches("data-chassis-reload").count(), 1);
    assert!(
        !page(Pwa::new().reload(Reload::Auto))
            .await
            .contains("data-chassis-reload")
    );
}
