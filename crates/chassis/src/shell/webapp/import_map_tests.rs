//! The kp-themes import map in a web app's pages: where it goes, what the
//! policy gains, which pages are left alone, and the `<script src>` rewrite.

use super::tests::{body, get_path};
use super::*;
use crate::shell::assets::kp_map;

const BOOT_BY_TAG: &[u8] = b"<html><head><script type=\"module\" src=\"/static/kp/dist/js/auto.js?v=1\"></script></head></html>";
const OWN_MAP: &[u8] =
    b"<html><head><script type=\"importmap\">{\"imports\":{}}</script></head></html>";
const BARE: &[u8] = b"<html><body>x</body></html>";
const INDEX_BY_TAG: &[u8] = b"<html><head><script type=\"module\" src='/static/kp/dist/js/index.js'></script></head></html>";
const FILES: &[(&str, &[u8])] = &[
    ("index.html", BOOT_BY_TAG),
    ("own.html", OWN_MAP),
    ("bare.html", BARE),
    ("all.html", INDEX_BY_TAG),
];

fn app() -> WebApp {
    WebApp::embedded(FILES).without_pwa().without_kit_runtime()
}

#[tokio::test]
async fn the_map_comes_first_in_the_head_and_the_policy_carries_its_hash() {
    let r = app().router().unwrap();
    let res = get_path(&r, "/", &[]).await;
    let csp = res.headers()["content-security-policy"]
        .to_str()
        .unwrap()
        .to_string();
    assert!(csp.contains("script-src 'self' 'sha256-"), "{csp}");
    assert!(!csp.contains("unsafe-inline"), "{csp}");
    let html = body(res).await;
    assert!(html.contains(&format!("<head>{}", kp_map::tag())), "{html}");
}

#[tokio::test]
async fn a_boot_tag_naming_the_split_entry_names_its_facade() {
    let r = app().router().unwrap();
    let html = body(get_path(&r, "/", &[]).await).await;
    assert!(
        html.contains("src=\"/static/kp/dist/bundle/auto.js?v=1\""),
        "{html}"
    );
    // The map itself names the prefix; only the tag's `src` moved.
    let scripts = html.split("<script").skip(2).collect::<String>();
    assert!(!scripts.contains("/static/kp/dist/js/"), "{html}");
}

#[tokio::test]
async fn index_by_tag_names_the_mapped_bundle() {
    // kyu C1 / Almanac 39: a tag is not resolved through the map, so it must
    // name the very URL the map gives, or the page holds two runtimes.
    let r = app().router().unwrap();
    let html = body(get_path(&r, "/all.html", &[]).await).await;
    assert!(
        html.contains(&format!("src='{}'", kp_map::bundle_url())),
        "{html}"
    );
}

#[tokio::test]
async fn a_page_with_its_own_import_map_is_left_alone() {
    let r = app().router().unwrap();
    let res = get_path(&r, "/own.html", &[]).await;
    let csp = res.headers()["content-security-policy"].to_str().unwrap();
    assert_eq!(csp, DEFAULT_CSP);
    assert_eq!(body(res).await.as_bytes(), OWN_MAP);
}

#[tokio::test]
async fn a_page_without_a_head_is_left_alone() {
    let r = app().router().unwrap();
    assert_eq!(
        body(get_path(&r, "/bare.html", &[]).await).await.as_bytes(),
        BARE
    );
}

#[tokio::test]
async fn a_policy_without_script_src_self_gets_no_map() {
    let r = app().csp("default-src 'none'").router().unwrap();
    let res = get_path(&r, "/", &[]).await;
    assert_eq!(
        res.headers()["content-security-policy"],
        "default-src 'none'"
    );
    assert_eq!(body(res).await.as_bytes(), BOOT_BY_TAG);
}
