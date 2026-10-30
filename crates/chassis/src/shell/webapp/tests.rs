//! Unit tests for `webapp`; kept in their own file so the module stays small.

use super::*;
use axum::Router;
use axum::body::Body;
use axum::http::Request;
use axum::response::Response;
use axum::routing::get;
use tower::ServiceExt;

const FILES: &[(&str, &[u8])] = &[
    ("index.html", b"<!doctype html><title>app</title>"),
    ("js/main.js", b"export const x = 1;"),
    ("css/app.css", b"body{}"),
];

async fn get_path(router: &Router, path: &str, headers: &[(&str, &str)]) -> Response {
    let mut req = Request::get(path);
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    router
        .clone()
        .oneshot(req.body(Body::empty()).unwrap())
        .await
        .unwrap()
}

async fn body(res: Response) -> String {
    let b = axum::body::to_bytes(res.into_body(), 1 << 20)
        .await
        .unwrap();
    String::from_utf8_lossy(&b).into_owned()
}

#[tokio::test]
async fn serves_the_index_the_files_and_their_types() {
    let r = WebApp::embedded(FILES).at("/app").router().unwrap();
    let res = get_path(&r, "/app/", &[]).await;
    assert_eq!(res.status(), 200);
    assert_eq!(res.headers()["content-type"], "text/html; charset=utf-8");
    assert_eq!(res.headers()["cache-control"], "no-cache");
    assert_eq!(res.headers()["content-security-policy"], DEFAULT_CSP);
    assert!(body(res).await.contains("<title>app</title>"));
    let res = get_path(&r, "/app/js/main.js", &[]).await;
    assert_eq!(
        res.headers()["content-type"],
        "text/javascript; charset=utf-8"
    );
    assert_eq!(body(res).await, "export const x = 1;");
    let res = get_path(&r, "/app", &[]).await;
    assert_eq!(res.status(), 308, "the bare mount redirects to the slash");
    assert_eq!(res.headers()["location"], "/app/");
}

#[tokio::test]
async fn a_client_route_gets_the_index_and_a_missing_file_a_404() {
    let r = WebApp::embedded(FILES).at("/app").router().unwrap();
    let res = get_path(&r, "/app/fleet/media", &[]).await;
    assert_eq!(res.status(), 200);
    assert!(body(res).await.contains("<title>app</title>"));
    let res = get_path(&r, "/app/js/gone.js", &[]).await;
    assert_eq!(res.status(), 404, "a file that is not there is not HTML");
}

#[tokio::test]
async fn an_unchanged_file_answers_304_and_a_versioned_url_is_immutable() {
    let r = WebApp::embedded(FILES).at("/app").router().unwrap();
    let res = get_path(&r, "/app/css/app.css", &[]).await;
    let etag = res.headers()["etag"].to_str().unwrap().to_string();
    let res = get_path(&r, "/app/css/app.css", &[("if-none-match", &etag)]).await;
    assert_eq!(res.status(), 304);
    let res = get_path(&r, "/app/css/app.css?v=abc", &[]).await;
    assert_eq!(
        res.headers()["cache-control"],
        "public, max-age=31536000, immutable"
    );
    let res = get_path(&r, "/app/?v=abc", &[]).await;
    assert_eq!(
        res.headers()["cache-control"],
        "no-cache",
        "index.html is never frozen"
    );
}

#[tokio::test]
async fn a_directory_source_serves_edits_and_never_leaves_its_root() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("web");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("index.html"), "v1").unwrap();
    std::fs::write(dir.path().join("secret.txt"), "do not serve").unwrap();
    let r = WebApp::dir(&root).at("/admin").router().unwrap();
    assert_eq!(body(get_path(&r, "/admin/", &[]).await).await, "v1");
    std::fs::write(root.join("index.html"), "v2").unwrap();
    assert_eq!(
        body(get_path(&r, "/admin/", &[]).await).await,
        "v2",
        "read per request"
    );
    for escape in [
        "/admin/../secret.txt",
        "/admin/%2e%2e/secret.txt",
        "/admin/..%2fsecret.txt",
    ] {
        let res = get_path(&r, escape, &[]).await;
        let status = res.status();
        let text = body(res).await;
        assert!(
            !text.contains("do not serve"),
            "{escape} leaked the file ({status})"
        );
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(dir.path().join("secret.txt"), root.join("link.txt")).unwrap();
        let res = get_path(&r, "/admin/link.txt", &[]).await;
        assert_eq!(
            res.status(),
            404,
            "a symlink out of the root is not followed"
        );
    }
}

#[test]
fn a_mount_that_hides_a_kit_route_or_lacks_an_index_is_refused() {
    for bad in ["/login", "/static/app", "/api", "/status", "app"] {
        let err = WebApp::embedded(FILES).at(bad).validate().unwrap_err();
        assert!(format!("{err:?}").contains("mount"), "{bad}: {err:?}");
    }
    assert!(WebApp::embedded(FILES).at("/admin").validate().is_ok());
    assert!(
        WebApp::embedded(FILES).validate().is_ok(),
        "the root is the default"
    );
    assert!(WebApp::embedded(FILES).at("/").at_root());
    assert!(
        WebApp::embedded(FILES).at("/apps").validate().is_ok(),
        "/apps is not /api"
    );
    const NO_INDEX: &[(&str, &[u8])] = &[("main.js", b"")];
    let err = WebApp::embedded(NO_INDEX).validate().unwrap_err();
    assert!(format!("{err:?}").contains("index.html"));
}

#[tokio::test]
async fn a_project_policy_replaces_the_default() {
    let r = WebApp::embedded(FILES)
        .at("/app")
        .csp("default-src 'self'; connect-src 'self' wss:")
        .router()
        .unwrap();
    let res = get_path(&r, "/app/", &[]).await;
    assert_eq!(
        res.headers()["content-security-policy"],
        "default-src 'self'; connect-src 'self' wss:"
    );
}

#[tokio::test]
async fn at_the_root_the_app_answers_what_no_route_claims() {
    let r = Router::new()
        .route("/status", get(|| async { "kit status" }))
        .merge(WebApp::embedded(FILES).router().unwrap());
    let res = get_path(&r, "/", &[]).await;
    assert_eq!(res.status(), 200);
    assert!(body(res).await.contains("<title>app</title>"));
    let res = get_path(&r, "/overview", &[]).await;
    assert!(
        body(res).await.contains("<title>app</title>"),
        "a client route"
    );
    let res = get_path(&r, "/js/main.js", &[]).await;
    assert_eq!(
        res.headers()["content-type"],
        "text/javascript; charset=utf-8"
    );
    assert_eq!(body(get_path(&r, "/status", &[]).await).await, "kit status");
    for kit in ["/api/nope", "/static/nope.css", "/healthz"] {
        assert_eq!(get_path(&r, kit, &[]).await.status(), 404, "{kit}");
    }
    let res = get_path(&r, "/app/stacks/media?tab=logs", &[]).await;
    assert_eq!(res.status(), 308, "an old bookmark moves to the root");
    assert_eq!(res.headers()["location"], "/stacks/media?tab=logs");
}
