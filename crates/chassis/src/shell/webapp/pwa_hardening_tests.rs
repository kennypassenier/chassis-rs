//! Regression tests from the PWA bug hunt (hunt-pwa): what the public
//! routes serve and how, the share guard's path, cache headers and types.

use super::tests::{body, get_path};
use super::*;

const PAGE: &[u8] = b"<html><head></head><body>x</body></html>";
const PNG: &[u8] = b"\x89PNG\r\n\x1a\nDATA";

fn routes(app: &WebApp) -> axum::Router {
    app.pwa_router("Hunt")
        .expect("installable")
        .merge(app.clone().router().unwrap())
}

#[test]
fn a_share_action_with_a_query_is_guarded_by_its_path() {
    let app = WebApp::embedded(&[("index.html", PAGE)])
        .pwa(Pwa::new().share_target(ShareTarget::get("/capture?src=share#top")));
    assert_eq!(app.get_share_path(), Some("/capture"));
}

#[tokio::test]
async fn only_a_v_parameter_freezes_a_file() {
    let files: &[(&str, &[u8])] = &[("index.html", PAGE), ("about.html", b"<p>a</p>")];
    let r = WebApp::embedded(files).router().unwrap();
    for (q, frozen) in [
        ("v=1", true),
        ("a=1&v=2", true),
        ("env=prod", false),
        ("prev=3", false),
        ("v", false),
    ] {
        let res = get_path(&r, &format!("/about.html?{q}"), &[]).await;
        let want = if frozen {
            "public, max-age=31536000, immutable"
        } else {
            "no-cache"
        };
        assert_eq!(res.headers()["cache-control"], want, "?{q}");
    }
}

#[tokio::test]
async fn the_app_files_a_pwa_ships_get_their_own_types() {
    let files: &[(&str, &[u8])] = &[
        ("index.html", PAGE),
        ("site.webmanifest", b"{}"),
        ("f/a.ttf", b"x"),
        ("f/a.otf", b"x"),
        ("i/a.avif", b"x"),
    ];
    let r = WebApp::embedded(files).router().unwrap();
    for (path, want) in [
        ("/site.webmanifest", "application/manifest+json"),
        ("/f/a.ttf", "font/ttf"),
        ("/f/a.otf", "font/otf"),
        ("/i/a.avif", "image/avif"),
    ] {
        let res = get_path(&r, path, &[]).await;
        assert_eq!(res.headers()["content-type"], want, "{path}");
    }
}

#[tokio::test]
async fn the_public_svg_icon_must_be_an_svg_document_and_runs_no_script() {
    let html_with_svg: &[u8] = b"<html><body><script>x()</script><svg></svg></body></html>";
    let fake_files: &'static [(&str, &[u8])] = Box::leak(Box::new([
        ("index.html", PAGE),
        ("pwa/icon.svg", html_with_svg),
    ]));
    let fake = WebApp::embedded(fake_files);
    let r = routes(&fake);
    assert_eq!(get_path(&r, "/pwa/icon.svg", &[]).await.status(), 404);
    assert!(!fake.pwa_head_html().unwrap().contains("icon.svg"));

    let real: &[u8] = b"\xef\xbb\xbf<?xml version=\"1.0\"?>\n<!-- c -->\n<!DOCTYPE svg>\n\
<svg xmlns=\"http://www.w3.org/2000/svg\"><script>x()</script></svg>";
    // A project may loosen the app's policy; the icon route must not follow.
    let real_files: &'static [(&str, &[u8])] =
        Box::leak(Box::new([("index.html", PAGE), ("pwa/icon.svg", real)]));
    let app = WebApp::embedded(real_files).csp("default-src 'self' 'unsafe-inline'");
    let res = get_path(&routes(&app), "/pwa/icon.svg", &[]).await;
    assert_eq!(res.status(), 200);
    let csp = res.headers()["content-security-policy"].to_str().unwrap();
    assert!(
        csp.contains("sandbox") && !csp.contains("unsafe-inline'; style"),
        "{csp}"
    );
    assert!(!csp.contains("default-src 'self'"), "{csp}");
}

#[test]
fn a_shortcut_icon_link_the_page_already_has_is_not_doubled() {
    use super::inject::with_head_tags;
    let tags = Pwa::new().head_tags(false);
    let page = b"<html><head><link rel=\"shortcut icon\" href=\"/f.ico\"></head></html>";
    let out = with_head_tags(std::borrow::Cow::Borrowed(&page[..]), false, Some(&tags));
    let out = String::from_utf8(out.into_owned()).unwrap();
    assert_eq!(out.matches("rel=\"icon\"").count(), 0, "{out}");
}

#[tokio::test]
async fn a_declared_icon_that_is_a_symlink_out_of_the_app_is_a_404() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("web");
    std::fs::create_dir_all(root.join("img")).unwrap();
    std::fs::write(root.join("index.html"), PAGE).unwrap();
    std::fs::write(dir.path().join("secret.png"), PNG).unwrap();
    std::os::unix::fs::symlink(dir.path().join("secret.png"), root.join("img/s.png")).unwrap();
    let app = WebApp::dir(&root).pwa(
        Pwa::new()
            .shortcut(Shortcut::new("S", "/s").icon("/img/s.png"))
            .screenshot(Screenshot::new("/img/s.png", "1x1", FormFactor::Wide)),
    );
    let r = routes(&app);
    assert_eq!(get_path(&r, "/img/s.png", &[]).await.status(), 404);
    assert_eq!(get_path(&r, "/img/s.png?x=1", &[]).await.status(), 404);
    assert_eq!(
        body(get_path(&r, "/IMG/s.png", &[]).await).await,
        "no such file"
    );
}
