//! A project's own browser application (feat-webapp-1): a folder of HTML,
//! JavaScript and CSS served under one path, behind the kit's login.
//!
//! The kit's dashboard renders pages on the server (`dashboard_routes`,
//! `render_project`). Some projects want the other shape: static files that
//! talk to the service's JSON API from the browser — the homelab admin
//! dashboard is plain HTML with ES modules and kp-themes, no build step.
//! This serves such a folder:
//!
//! * from files compiled into the binary ([`WebApp::embedded`]) or read from
//!   a directory on each request ([`WebApp::dir`], for development);
//! * under a mount path (`/app` by default), where a path without a file
//!   extension that matches no file answers `index.html` so a client-side
//!   router owns the rest of the URL;
//! * with a strong `ETag` and `no-cache` so a changed file is picked up on
//!   the next load without a build step renaming it, and a year of
//!   `immutable` when the URL carries `?v=` (the kit's own convention);
//! * with its own `Content-Security-Policy`, the kit's by default: scripts,
//!   styles, fonts and connections from this origin only;
//! * behind the admin login, exactly like the kit's pages: a browser
//!   without a session is sent to `/login`, a script without the login
//!   token gets a 401.
//!
//! The kit's own routes cannot be shadowed: a mount path that is `/` or
//! starts with one of them is refused at start and at `--check`.

use std::borrow::Cow;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use axum::Router;
use axum::extract::{RawQuery, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;

use crate::core::error::Error;

/// The policy a web app gets unless it names its own: the kit's pages'
/// policy. `'unsafe-inline'` for styles covers `style=""` attributes that
/// kp-themes' components write; scripts stay `'self'` only.
pub const DEFAULT_CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

/// Paths the kit serves itself; a web app mounted on or under one of them
/// would hide it.
const RESERVED: &[&str] = &[
    "/login",
    "/logout",
    "/static",
    "/api",
    "/clients",
    "/passkeys",
    "/healthz",
    "/metrics",
];

/// Where the files come from.
#[derive(Clone)]
enum Source {
    /// `(path relative to the app root, bytes)`, e.g. `("index.html",
    /// include_bytes!("../web/index.html"))`.
    Embedded(&'static [(&'static str, &'static [u8])]),
    /// A directory read on every request.
    Dir(PathBuf),
}

/// A static browser application served under one path behind the login.
/// Register it with [`crate::App::webapp`].
#[derive(Clone)]
pub struct WebApp {
    mount: String,
    source: Source,
    csp: String,
}

impl WebApp {
    /// Files compiled into the binary. Paths are relative to the app root
    /// and use `/` (`"index.html"`, `"js/fleet.js"`); `index.html` must be
    /// one of them.
    pub fn embedded(files: &'static [(&'static str, &'static [u8])]) -> Self {
        WebApp {
            mount: "/app".to_string(),
            source: Source::Embedded(files),
            csp: DEFAULT_CSP.to_string(),
        }
    }

    /// Files read from `dir` on every request: edit, reload, no rebuild.
    /// Meant for development; a release embeds.
    pub fn dir(dir: impl Into<PathBuf>) -> Self {
        WebApp {
            mount: "/app".to_string(),
            source: Source::Dir(dir.into()),
            csp: DEFAULT_CSP.to_string(),
        }
    }

    /// Serve under `path` instead of `/app`. It starts with `/`, is not `/`
    /// and does not start with one of the kit's own routes.
    pub fn at(mut self, path: &str) -> Self {
        self.mount = path.trim_end_matches('/').to_string();
        self
    }

    /// Replace [`DEFAULT_CSP`] for this app's responses.
    pub fn csp(mut self, policy: &str) -> Self {
        self.csp = policy.to_string();
        self
    }

    /// The mount path, without a trailing slash.
    pub fn mount(&self) -> &str {
        &self.mount
    }

    /// Refuse what would break at the first request: a mount that hides a
    /// kit route, a missing `index.html`, a directory that is not there.
    pub fn validate(&self) -> Result<(), Error> {
        let m = self.mount.as_str();
        if !m.starts_with('/') || m.is_empty() {
            return Err(Error::config(
                format!("the web app's mount path `{m}` is not an absolute path"),
                "mount it at a path that starts with `/`, e.g. WebApp::embedded(FILES).at(\"/app\")",
            ));
        }
        if let Some(r) = RESERVED
            .iter()
            .find(|r| m == **r || m.starts_with(&format!("{r}/")))
        {
            return Err(Error::config(
                format!("the web app's mount path `{m}` would hide the kit's own `{r}`"),
                "mount it elsewhere, e.g. `/app`; the kit's routes are /, /login, /logout, /static, /api, /clients, /passkeys, /healthz and /metrics",
            ));
        }
        match &self.source {
            Source::Embedded(files) => {
                if !files.iter().any(|(p, _)| *p == "index.html") {
                    return Err(Error::config(
                        "the embedded web app has no `index.html`",
                        "add (\"index.html\", include_bytes!(…)) to the files passed to WebApp::embedded",
                    ));
                }
            }
            Source::Dir(dir) => {
                if !dir.join("index.html").is_file() {
                    return Err(Error::config(
                        format!("the web app directory {} has no index.html", dir.display()),
                        "point WebApp::dir at the folder that holds index.html",
                    ));
                }
            }
        }
        Ok(())
    }

    /// The routes, unprotected: the caller layers the login in front.
    pub(crate) fn router(self) -> Result<Router, Error> {
        self.validate()?;
        let mount = self.mount.clone();
        let state = Arc::new(self);
        // `/app` itself redirects to `/app/` so relative URLs in index.html
        // resolve under the mount.
        let slash = format!("{mount}/");
        let redirect_to = slash.clone();
        Ok(Router::new()
            .route(
                &mount,
                get(move || async move { axum::response::Redirect::permanent(&redirect_to) }),
            )
            .route(&slash, get(serve))
            .route(&format!("{mount}/{{*path}}"), get(serve))
            .with_state(state))
    }
}

/// The asset path a request names, relative to the app root, or `None`
/// for anything that tries to leave it.
fn relative_path(mount: &str, uri_path: &str) -> Option<String> {
    let rest = uri_path.strip_prefix(mount)?.trim_start_matches('/');
    let decoded = percent_decode(rest)?;
    let mut clean = Vec::new();
    for part in Path::new(&decoded).components() {
        match part {
            Component::Normal(p) => clean.push(p.to_str()?.to_string()),
            Component::CurDir => {}
            // `..`, a root or a prefix: never inside the app.
            _ => return None,
        }
    }
    if decoded.contains('\\') || decoded.contains('\0') {
        return None;
    }
    Some(clean.join("/"))
}

/// `%xx` decoding; `None` for a malformed escape or a non-UTF-8 result.
fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = s.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn content_type(path: &str) -> &'static str {
    match path.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()) {
        Some(e) => match e.as_str() {
            "html" | "htm" => "text/html; charset=utf-8",
            "js" | "mjs" => "text/javascript; charset=utf-8",
            "css" => "text/css; charset=utf-8",
            "json" | "map" => "application/json",
            "svg" => "image/svg+xml",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "ico" => "image/x-icon",
            "woff2" => "font/woff2",
            "woff" => "font/woff",
            "txt" => "text/plain; charset=utf-8",
            "wasm" => "application/wasm",
            _ => "application/octet-stream",
        },
        None => "application/octet-stream",
    }
}

async fn read(source: &Source, rel: &str) -> Option<Cow<'static, [u8]>> {
    match source {
        Source::Embedded(files) => files
            .iter()
            .find(|(p, _)| *p == rel)
            .map(|(_, b)| Cow::Borrowed(*b)),
        Source::Dir(root) => {
            let path = root.join(rel);
            // Symlinks may point anywhere; only what resolves inside the
            // root is served.
            let (canon, root) = (
                tokio::fs::canonicalize(&path).await.ok()?,
                tokio::fs::canonicalize(root).await.ok()?,
            );
            if !canon.starts_with(&root) || !canon.is_file() {
                return None;
            }
            tokio::fs::read(&canon).await.ok().map(Cow::Owned)
        }
    }
}

async fn serve(
    State(app): State<Arc<WebApp>>,
    uri: Uri,
    RawQuery(query): RawQuery,
    headers: HeaderMap,
) -> Response {
    let csp =
        HeaderValue::from_str(&app.csp).unwrap_or_else(|_| HeaderValue::from_static(DEFAULT_CSP));
    let Some(rel) = relative_path(&app.mount, uri.path()) else {
        let mut res = (StatusCode::NOT_FOUND, "no such file").into_response();
        res.headers_mut()
            .insert(header::CONTENT_SECURITY_POLICY, csp);
        return res;
    };
    let wanted = if rel.is_empty() || uri.path().ends_with('/') && !rel.contains('.') {
        if rel.is_empty() {
            "index.html".to_string()
        } else {
            format!("{rel}/index.html")
        }
    } else {
        rel.clone()
    };
    let last_has_extension = rel.rsplit('/').next().is_some_and(|s| s.contains('.'));
    let (served, body) = match read(&app.source, &wanted).await {
        Some(b) => (wanted, b),
        // A route of the client-side router (`/app/fleet/media`): the app
        // decides what it shows. A missing file (`/app/js/gone.js`) stays
        // a 404, so a typo is not answered with HTML.
        None if !last_has_extension => match read(&app.source, "index.html").await {
            Some(b) => ("index.html".to_string(), b),
            None => return (StatusCode::NOT_FOUND, "no index.html").into_response(),
        },
        None => {
            let mut res = (StatusCode::NOT_FOUND, "no such file").into_response();
            res.headers_mut()
                .insert(header::CONTENT_SECURITY_POLICY, csp);
            return res;
        }
    };
    let etag = format!(
        "\"{}\"",
        crate::shell::assets::fnv_version(std::iter::once(("", body.as_ref())))
    );
    let versioned = query.as_deref().is_some_and(|q| q.contains("v="));
    let cache = if versioned && served != "index.html" {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    let matches = headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.split(',').any(|t| t.trim() == etag));
    let mut res = if matches {
        StatusCode::NOT_MODIFIED.into_response()
    } else {
        (
            [(header::CONTENT_TYPE, content_type(&served))],
            body.into_owned(),
        )
            .into_response()
    };
    let h = res.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
    if let Ok(v) = HeaderValue::from_str(&etag) {
        h.insert(header::ETAG, v);
    }
    h.insert(header::CONTENT_SECURITY_POLICY, csp);
    res
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
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
        let r = WebApp::embedded(FILES).router().unwrap();
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
        let r = WebApp::embedded(FILES).router().unwrap();
        let res = get_path(&r, "/app/fleet/media", &[]).await;
        assert_eq!(res.status(), 200);
        assert!(body(res).await.contains("<title>app</title>"));
        let res = get_path(&r, "/app/js/gone.js", &[]).await;
        assert_eq!(res.status(), 404, "a file that is not there is not HTML");
    }

    #[tokio::test]
    async fn an_unchanged_file_answers_304_and_a_versioned_url_is_immutable() {
        let r = WebApp::embedded(FILES).router().unwrap();
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
            std::os::unix::fs::symlink(dir.path().join("secret.txt"), root.join("link.txt"))
                .unwrap();
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
        for bad in ["/", "/login", "/static/app", "/api", "app"] {
            let err = WebApp::embedded(FILES).at(bad).validate().unwrap_err();
            assert!(format!("{err:?}").contains("mount"), "{bad}: {err:?}");
        }
        assert!(WebApp::embedded(FILES).at("/admin").validate().is_ok());
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
            .csp("default-src 'self'; connect-src 'self' wss:")
            .router()
            .unwrap();
        let res = get_path(&r, "/app/", &[]).await;
        assert_eq!(
            res.headers()["content-security-policy"],
            "default-src 'self'; connect-src 'self' wss:"
        );
    }
}
