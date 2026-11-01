//! A web app mounted below the root is installable: the whole service is the
//! installed app, so the manifest, worker and icons stay at the root while
//! their files come from the mount's web app; plus the vector icon and the
//! head markup for pages the project renders itself.

use super::tests::{body, get_path};
use super::*;
use axum::Router;

const PAGE: &[u8] = b"<!doctype html><html><head><title>a</title></head><body>x</body></html>";
const OWN_ICON: &[u8] = b"\x89PNG\r\n\x1a\nOWN";
const SVG: &[u8] = b"<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"/>";
const FILES: &[(&str, &[u8])] = &[("index.html", PAGE), ("pwa/icon-192.png", OWN_ICON)];
const WITH_SVG: &[(&str, &[u8])] = &[("index.html", PAGE), ("pwa/icon.svg", SVG)];
const FAKE_SVG: &[(&str, &[u8])] = &[("index.html", PAGE), ("pwa/icon.svg", b"<html>no</html>")];

fn routes(app: &WebApp) -> Router {
    app.pwa_router("Switchboard")
        .expect("installable")
        .merge(app.clone().router().unwrap())
}

async fn manifest(r: &Router) -> serde_json::Value {
    serde_json::from_str(&body(get_path(r, "/manifest.webmanifest", &[]).await).await).unwrap()
}

#[tokio::test]
async fn a_sub_mounted_app_installs_from_the_root_with_its_own_files() {
    let app = WebApp::embedded(FILES).at("/app/hsb");
    let r = routes(&app);
    let m = manifest(&r).await;
    assert_eq!(m["start_url"], "/app/hsb/");
    assert_eq!(
        (m["scope"].as_str(), m["id"].as_str()),
        (Some("/"), Some("/"))
    );
    let icon = get_path(&r, "/pwa/icon-192.png", &[]).await;
    assert_eq!(icon.status(), 200);
    let bytes = axum::body::to_bytes(icon.into_body(), 1 << 20)
        .await
        .unwrap();
    assert!(
        bytes.ends_with(b"OWN"),
        "the mount's own file, not the generated icon"
    );
    assert_eq!(get_path(&r, "/sw.js", &[]).await.status(), 200);
    assert_eq!(get_path(&r, "/favicon.ico", &[]).await.status(), 308);
    // The app's page carries the tags, at its own path.
    let page = body(get_path(&r, "/app/hsb/", &[]).await).await;
    assert!(
        page.contains("rel=\"manifest\"") && page.contains("webapp-runtime.js"),
        "{page}"
    );
}

#[tokio::test]
async fn the_start_url_defaults_to_the_mount_and_can_be_set() {
    let root = routes(&WebApp::embedded(FILES));
    assert_eq!(
        manifest(&root).await["start_url"],
        "/",
        "the root case is unchanged"
    );
    let set = WebApp::embedded(FILES)
        .at("/ui")
        .pwa(Pwa::new().start_url("/"));
    assert_eq!(manifest(&routes(&set)).await["start_url"], "/");
    let deep = WebApp::embedded(FILES)
        .at("/ui")
        .pwa(Pwa::new().start_url("/ui/today"));
    assert_eq!(manifest(&routes(&deep)).await["start_url"], "/ui/today");
}

#[test]
fn a_start_url_outside_the_app_is_refused() {
    for bad in ["today", "//evil.example/", "https://evil.example/", ""] {
        let app = WebApp::embedded(FILES).pwa(Pwa::new().start_url(bad));
        let err = app.validate().unwrap_err().to_string();
        assert!(err.contains("start_url"), "{bad}: {err}");
    }
    assert!(
        WebApp::embedded(FILES)
            .pwa(Pwa::new().start_url("/a?b=1"))
            .validate()
            .is_ok()
    );
}

#[test]
fn two_installable_web_apps_are_refused_with_the_mounts_named() {
    let a = WebApp::embedded(FILES).at("/app/hsb");
    let b = WebApp::embedded(FILES).at("/ui");
    let err = single_installable(&[a.clone(), b.clone()])
        .unwrap_err()
        .to_string();
    assert!(
        err.contains("/app/hsb") && err.contains("/ui") && err.contains("without_pwa"),
        "{err}"
    );
    assert!(single_installable(&[a.clone(), b.clone().without_pwa()]).is_ok());
    assert!(single_installable(&[a, b.without_kit_runtime()]).is_ok());
    assert!(single_installable(&[]).is_ok());
}

#[tokio::test]
async fn an_svg_icon_is_listed_linked_and_served() {
    let app = WebApp::embedded(WITH_SVG).at("/app/hsb");
    let r = routes(&app);
    let m = manifest(&r).await;
    let svg = m["icons"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["src"] == "/pwa/icon.svg");
    let svg = svg.expect("icon.svg listed");
    assert_eq!(
        (svg["sizes"].as_str(), svg["type"].as_str()),
        (Some("any"), Some("image/svg+xml"))
    );
    let res = get_path(&r, "/pwa/icon.svg", &[]).await;
    assert_eq!(res.status(), 200);
    assert_eq!(res.headers()["content-type"], "image/svg+xml");
    let head = app.pwa_head_html().unwrap();
    let (s, p) = (
        head.find("href=\"/pwa/icon.svg\" type=\"image/svg+xml\"")
            .expect("svg link"),
        head.find("href=\"/pwa/icon-192.png\" type=\"image/png\"")
            .expect("png fallback"),
    );
    assert!(s < p, "the vector icon comes first: {head}");
}

#[tokio::test]
async fn without_a_real_svg_nothing_is_listed_or_served() {
    for files in [FILES, FAKE_SVG] {
        let app = WebApp::embedded(files);
        let r = routes(&app);
        assert!(!manifest(&r).await.to_string().contains("icon.svg"));
        assert_eq!(get_path(&r, "/pwa/icon.svg", &[]).await.status(), 404);
        assert!(!app.pwa_head_html().unwrap().contains("icon.svg"));
    }
}

#[test]
fn the_page_head_helper_adds_the_register_script() {
    let head = WebApp::embedded(FILES)
        .at("/ui")
        .pwa_page_head()
        .expect("installable");
    assert!(
        head.contains("rel=\"manifest\" href=\"/manifest.webmanifest\""),
        "{head}"
    );
    assert!(head.contains("name=\"theme-color\"") && head.contains("apple-touch-icon"));
    assert!(
        head.contains("<script type=\"module\" src=\"/static/chassis/pwa-boot.js?v="),
        "{head}"
    );
    assert!(
        !head.contains("<script>"),
        "no inline script under script-src 'self'"
    );
    assert!(
        WebApp::embedded(FILES)
            .without_pwa()
            .pwa_page_head()
            .is_none()
    );
    assert!(
        WebApp::embedded(FILES)
            .without_kit_runtime()
            .pwa_page_head()
            .is_none()
    );
}

#[test]
fn two_web_apps_on_one_mount_are_refused_before_the_router_merge() {
    let a = WebApp::embedded(FILES).at("/ui").without_pwa();
    let b = WebApp::embedded(FILES).at("/ui").without_pwa();
    let err = single_installable(&[a, b]).unwrap_err().to_string();
    assert!(err.contains("/ui") && err.contains(".at("), "{err}");
}
