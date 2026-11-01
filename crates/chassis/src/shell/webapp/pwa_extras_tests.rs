//! Locks the optional manifest members (Habits, 2026-11-01): home-screen
//! shortcuts and the share target, and the refusals for what a browser
//! would silently drop.

use super::tests::{body, get_path};
use super::*;

const FILES: &[(&str, &[u8])] = &[("index.html", b"<html><head></head><body>x</body></html>")];

async fn manifest(pwa: Pwa) -> serde_json::Value {
    let app = WebApp::embedded(FILES).pwa(pwa);
    let r = app
        .pwa_router("Habits")
        .expect("installable")
        .merge(app.router().unwrap());
    serde_json::from_str(&body(get_path(&r, "/manifest.webmanifest", &[]).await).await).unwrap()
}

#[tokio::test]
async fn shortcuts_and_a_get_share_target_land_in_the_manifest() {
    let m = manifest(
        Pwa::new()
            .shortcut(Shortcut::new("Inbox", "/inbox").short_name("In"))
            .shortcut(Shortcut::new("Focus", "/focus").description("Start a focus block"))
            .share_target(ShareTarget::get("/capture")),
    )
    .await;
    assert_eq!(m["shortcuts"][0]["name"], "Inbox");
    assert_eq!(m["shortcuts"][0]["url"], "/inbox");
    assert_eq!(m["shortcuts"][0]["short_name"], "In");
    assert_eq!(m["shortcuts"][1]["description"], "Start a focus block");
    assert_eq!(m["share_target"]["action"], "/capture");
    assert_eq!(m["share_target"]["method"], "GET");
    assert_eq!(m["share_target"]["params"]["text"], "text");
    assert!(
        m["share_target"].get("enctype").is_none(),
        "a GET has no body"
    );
}

#[tokio::test]
async fn files_make_the_share_target_a_multipart_post() {
    let m = manifest(
        Pwa::new().share_target(
            ShareTarget::get("/capture")
                .params("t", "body", "link")
                .files("attachments", &["image/*", ".pdf"]),
        ),
    )
    .await;
    let t = &m["share_target"];
    assert_eq!(t["method"], "POST");
    assert_eq!(t["enctype"], "multipart/form-data");
    assert_eq!(t["params"]["title"], "t");
    assert_eq!(t["params"]["url"], "link");
    assert_eq!(t["params"]["files"][0]["name"], "attachments");
    assert_eq!(t["params"]["files"][0]["accept"][1], ".pdf");
}

#[tokio::test]
async fn without_either_the_manifest_carries_neither() {
    let m = manifest(Pwa::new()).await;
    assert!(m.get("shortcuts").is_none() && m.get("share_target").is_none());
}

#[test]
fn what_a_browser_would_drop_is_refused_at_start() {
    let refuse = |pwa: Pwa| {
        WebApp::embedded(FILES)
            .pwa(pwa)
            .validate()
            .unwrap_err()
            .to_string()
    };
    assert!(
        refuse(Pwa::new().shortcut(Shortcut::new("Away", "https://example.com/x")))
            .contains("shortcut")
    );
    assert!(
        refuse(Pwa::new().shortcut(Shortcut::new("Host", "//example.com"))).contains("shortcut")
    );
    assert!(refuse(Pwa::new().shortcut(Shortcut::new(" ", "/x"))).contains("empty name"));
    let five = (0..5).fold(Pwa::new(), |p, i| {
        p.shortcut(Shortcut::new("s", &format!("/{i}")))
    });
    assert!(refuse(five).contains("5 shortcuts"));
    assert!(refuse(Pwa::new().share_target(ShareTarget::post("capture"))).contains("share target"));
    assert!(
        refuse(Pwa::new().share_target(ShareTarget::get("/c").params("", "t", "u")))
            .contains("parameter")
    );
    assert!(
        WebApp::embedded(FILES)
            .pwa(Pwa::new().shortcut(Shortcut::new("Inbox", "/inbox")))
            .validate()
            .is_ok()
    );
}
