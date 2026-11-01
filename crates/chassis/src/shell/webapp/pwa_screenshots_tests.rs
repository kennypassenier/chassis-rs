//! Locks the manifest screenshots (Habits, 2026-11-01), their public route,
//! and the favicon: the tab icon link and the `/favicon.ico` redirect.

use super::tests::{body, get_path};
use super::*;

const PAGE: &[u8] = b"<html><head></head><body>x</body></html>";
const PNG: &[u8] = b"\x89PNG\r\n\x1a\nSHOT";
const WEBP: &[u8] = b"RIFF\x00\x00\x00\x00WEBPVP8 ";
const FILES: &[(&str, &[u8])] = &[
    ("index.html", PAGE),
    ("img/today.png", PNG),
    ("img/wide.webp", WEBP),
    ("img/fake.png", b"not a png"),
    ("img/private.png", PNG),
];

fn pwa() -> Pwa {
    Pwa::new()
        .screenshot(
            Screenshot::new("/img/today.png", "1080x1920", FormFactor::Narrow).label("Today"),
        )
        .screenshot(Screenshot::new(
            "/img/wide.webp",
            "1920x1080",
            FormFactor::Wide,
        ))
        .screenshot(Screenshot::new("/img/fake.png", "10x10", FormFactor::Wide))
}

fn public() -> axum::Router {
    WebApp::embedded(FILES)
        .pwa(pwa())
        .pwa_router("Habits")
        .unwrap()
}

async fn status_and_type(r: &axum::Router, path: &str) -> (u16, String) {
    let res = get_path(r, path, &[]).await;
    let ct = res
        .headers()
        .get("content-type")
        .map(|v| v.to_str().unwrap().to_string());
    (res.status().as_u16(), ct.unwrap_or_default())
}

#[tokio::test]
async fn screenshots_land_in_the_manifest_with_type_from_the_extension() {
    let r = public();
    let m: serde_json::Value =
        serde_json::from_str(&body(get_path(&r, "/manifest.webmanifest", &[]).await).await)
            .unwrap();
    assert_eq!(
        m["screenshots"][0],
        serde_json::json!({"src": "/img/today.png", "sizes": "1080x1920",
            "type": "image/png", "form_factor": "narrow", "label": "Today"})
    );
    assert_eq!(m["screenshots"][1]["type"], "image/webp");
    assert_eq!(m["screenshots"][1]["form_factor"], "wide");
    assert!(m["screenshots"][1].get("label").is_none());
    let none = WebApp::embedded(FILES).pwa_router("H").unwrap();
    let m: serde_json::Value =
        serde_json::from_str(&body(get_path(&none, "/manifest.webmanifest", &[]).await).await)
            .unwrap();
    assert!(m.get("screenshots").is_none());
}

#[tokio::test]
async fn declared_screenshots_are_public_and_nothing_else_is() {
    let r = public();
    assert_eq!(
        status_and_type(&r, "/img/today.png").await,
        (200, "image/png".into())
    );
    assert_eq!(
        status_and_type(&r, "/img/wide.webp").await,
        (200, "image/webp".into())
    );
    assert_eq!(
        status_and_type(&r, "/img/fake.png").await.0,
        404,
        "wrong type"
    );
    assert_eq!(
        status_and_type(&r, "/img/private.png").await.0,
        404,
        "not declared"
    );
    // The app router (behind the login in a real mount) still serves it.
    let app = WebApp::embedded(FILES).pwa(pwa()).router().unwrap();
    assert_eq!(status_and_type(&app, "/img/private.png").await.0, 200);
    let missing = Pwa::new().screenshot(Screenshot::new("/img/gone.png", "1x1", FormFactor::Wide));
    let r = WebApp::embedded(FILES)
        .pwa(missing)
        .pwa_router("H")
        .unwrap();
    assert_eq!(status_and_type(&r, "/img/gone.png").await.0, 404);
}

#[test]
fn a_screenshot_that_a_browser_would_drop_is_refused() {
    let bad = [
        ("shot.png", "1x1"),
        ("https://x.test/a.png", "1x1"),
        ("/a.jpg", "1x1"),
        ("/a.png?v=1", "1x1"),
        ("/a.png#x", "1x1"),
        ("/../a.png", "1x1"),
        ("/a.png", "1080"),
        ("/a.png", "1080x"),
        ("/a.png", "axb"),
        ("/a.png", "0x10"),
    ];
    for (path, sizes) in bad {
        let err = WebApp::embedded(FILES)
            .pwa(Pwa::new().screenshot(Screenshot::new(path, sizes, FormFactor::Wide)))
            .validate()
            .unwrap_err()
            .to_string();
        assert!(err.contains("screenshot"), "{path} {sizes}: {err}");
    }
    assert!(WebApp::embedded(FILES).pwa(pwa()).validate().is_ok());
}

#[tokio::test]
async fn an_installable_page_carries_the_favicon_link_once() {
    let page =
        |app: WebApp| async move { body(get_path(&app.router().unwrap(), "/", &[]).await).await };
    let tag = "<link rel=\"icon\" href=\"/pwa/icon-192.png\" type=\"image/png\">";
    let html = page(WebApp::embedded(FILES)).await;
    assert_eq!(html.matches(tag).count(), 1, "{html}");
    assert!(html.find("rel=\"manifest\"").unwrap() < html.find(tag).unwrap());
    assert!(
        !page(WebApp::embedded(FILES).without_pwa())
            .await
            .contains("rel=\"icon\"")
    );
    assert!(
        !page(WebApp::embedded(FILES).at("/app"))
            .await
            .contains("rel=\"icon\"")
    );
    assert!(
        !page(WebApp::embedded(FILES).without_kit_runtime())
            .await
            .contains("rel=\"icon\"")
    );
    // The kit's own pages get it with the rest of the tags.
    let kit = WebApp::embedded(FILES).pwa_head_html().unwrap();
    assert!(kit.contains(tag));
}

#[tokio::test]
async fn favicon_ico_redirects_to_the_app_icon_only_when_installable() {
    let res = get_path(&public(), "/favicon.ico", &[]).await;
    assert_eq!(res.status(), 308);
    assert_eq!(res.headers()["location"], "/pwa/icon-192.png");
    assert!(
        WebApp::embedded(FILES)
            .without_pwa()
            .pwa_router("H")
            .is_none()
    );
}

#[tokio::test]
async fn an_apps_own_favicon_ico_is_served_instead_of_the_redirect() {
    const ICO: &[u8] = b"\0\0\x01\0\x01\0 own icon bytes";
    const WITH_ICON: &[(&str, &[u8])] = &[
        ("index.html", b"<html><head></head><body>x</body></html>"),
        ("favicon.ico", ICO),
    ];
    let own = WebApp::embedded(WITH_ICON).pwa_router("H").unwrap();
    let res = get_path(&own, "/favicon.ico", &[]).await;
    assert_eq!(res.status(), 200);
    assert_eq!(res.headers()["content-type"], "image/x-icon");
    let bytes = axum::body::to_bytes(res.into_body(), 1 << 20)
        .await
        .unwrap();
    assert_eq!(&bytes[..], ICO, "the app's file, not the generated icon");
    // An app without the file still gets the redirect.
    assert_eq!(get_path(&public(), "/favicon.ico", &[]).await.status(), 308);
}

#[cfg(feature = "push")]
#[tokio::test]
async fn an_installable_page_carries_the_push_marker_once() {
    let html = body(get_path(&WebApp::embedded(FILES).router().unwrap(), "/", &[]).await).await;
    assert_eq!(html.matches("name=\"chassis-push\"").count(), 1, "{html}");
    let off = WebApp::embedded(FILES).without_pwa().router().unwrap();
    assert!(
        !body(get_path(&off, "/", &[]).await)
            .await
            .contains("chassis-push")
    );
}
