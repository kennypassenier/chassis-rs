//! The routes that make the web app installable: the manifest, the service
//! worker, the offline page and the icons. They are public (the browser
//! fetches them without a session, and a service worker is installed
//! before any login), so this router is merged outside the login layer and
//! holds exactly these paths and nothing else.

use std::borrow::Cow;
use std::sync::Arc;

use axum::Router;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;

use super::super::files::read;
use super::super::serving::file_response;
use super::super::{DEFAULT_CSP, Source, WebApp};
use super::icons::{default_icon, initial};
use super::png::SIGNATURE;
use super::{Pwa, manifest, worker};

pub(super) const MANIFEST_PATH: &str = "/manifest.webmanifest";
pub(super) const SW_PATH: &str = "/sw.js";
pub(super) const TOUCH_ICON_PATH: &str = "/pwa/icon-180.png";
pub(super) const ICON_192_PATH: &str = "/pwa/icon-192.png";
pub(super) const ICON_512_PATH: &str = "/pwa/icon-512.png";
pub(super) const ICON_MASKABLE_PATH: &str = "/pwa/icon-maskable-512.png";

/// (URL path, side in px) of every icon; a file of the web app at the same
/// path without the leading slash replaces the generated one.
const ICONS: [(&str, u32); 4] = [
    (TOUCH_ICON_PATH, 180),
    (ICON_192_PATH, 192),
    (ICON_512_PATH, 512),
    (ICON_MASKABLE_PATH, 512),
];

/// What the routes serve, fixed when the server starts.
pub(in crate::shell::webapp) struct PwaState {
    source: Source,
    csp: String,
    pwa: Pwa,
    name: String,
    generated: Vec<(&'static str, Vec<u8>)>,
}

impl PwaState {
    /// The state for `app`, or `None` when it is not installable: opted
    /// out, mounted below the root (the worker's scope would be wrong) or
    /// without the kit runtime (which registers the worker).
    pub(in crate::shell::webapp) fn for_app(app: &WebApp, brand: &str) -> Option<Arc<Self>> {
        let pwa = app
            .pwa
            .clone()
            .filter(|_| app.at_root() && app.kit_runtime)?;
        let name = pwa.name.clone().unwrap_or_else(|| brand.to_string());
        let letter = initial(&name);
        let generated = ICONS
            .iter()
            .map(|(path, side)| {
                (
                    *path,
                    default_icon(*side, letter, &pwa.theme_color, &pwa.background_color),
                )
            })
            .collect();
        Some(Arc::new(PwaState {
            source: app.source.clone(),
            csp: app.csp.clone(),
            pwa,
            name,
            generated,
        }))
    }

    fn csp(&self) -> HeaderValue {
        HeaderValue::from_str(&self.csp).unwrap_or_else(|_| HeaderValue::from_static(DEFAULT_CSP))
    }
}

/// The public routes of an installable web app.
pub(in crate::shell::webapp) fn router(state: Arc<PwaState>) -> Router {
    let mut r = Router::new()
        .route(MANIFEST_PATH, get(serve_manifest))
        .route(SW_PATH, get(serve_worker))
        .route("/pwa/offline", get(serve_offline))
        .route("/pwa/offline.js", get(serve_offline_js));
    for (path, _) in ICONS {
        r = r.route(path, get(serve_icon));
    }
    r.with_state(state)
}

/// A text answer that is never cached by the browser's HTTP cache.
fn text(content_type: &'static str, body: String, csp: HeaderValue) -> Response {
    let mut res = ([(header::CONTENT_TYPE, content_type)], body).into_response();
    let h = res.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    h.insert(header::CONTENT_SECURITY_POLICY, csp);
    res
}

async fn serve_manifest(State(s): State<Arc<PwaState>>) -> Response {
    let body = manifest::manifest(&s.pwa, &s.name).to_string();
    text("application/manifest+json", body, s.csp())
}

/// The worker. `no-cache` makes the browser check it on every load, which is
/// how a new release reaches an installed app.
async fn serve_worker(State(s): State<Arc<PwaState>>) -> Response {
    let app_version = worker::app_version(&s.source).await;
    let body = worker::sw_source(crate::shell::assets::asset_version(), &app_version);
    text("text/javascript; charset=utf-8", body, s.csp())
}

async fn serve_offline(State(s): State<Arc<PwaState>>) -> Response {
    let body = worker::offline_page(crate::shell::assets::asset_version(), &s.pwa.theme_color);
    text("text/html; charset=utf-8", body, s.csp())
}

async fn serve_offline_js(State(s): State<Arc<PwaState>>) -> Response {
    text(
        "text/javascript; charset=utf-8",
        worker::OFFLINE_JS.to_string(),
        s.csp(),
    )
}

/// An icon: the web app's own file at the same path when it is a PNG, else
/// the generated one.
async fn serve_icon(
    State(s): State<Arc<PwaState>>,
    uri: axum::http::Uri,
    headers: HeaderMap,
) -> Response {
    let path = uri.path();
    let own = read(&s.source, path.trim_start_matches('/'))
        .await
        .filter(|b| b.starts_with(&SIGNATURE));
    let body = own.unwrap_or_else(|| {
        let generated = s.generated.iter().find(|(p, _)| *p == path);
        Cow::Owned(generated.map(|(_, b)| b.clone()).unwrap_or_default())
    });
    file_response("icon.png", body, false, &headers, s.csp())
}
