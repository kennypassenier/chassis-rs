//! The kit's own routers behind the dashboard: the public login pages, the
//! admin pages and their JSON data, the storage, notification and
//! preferences APIs, and the clients API.

use axum::Router;
use axum::middleware::from_fn_with_state;
use axum::routing::{delete, get, post};

use super::MountExtra;
use super::dashboard_build::Built;
use crate::shell::assets;
use crate::shell::auth::{AuthState, logout_handler, require_admin};
use crate::shell::clients_api::{self, ClientsApi};
use crate::shell::dashboard;
use crate::shell::guards::{IpLimit, ip_rate_limit};

/// The routers the kit mounts, before the project's own are added.
pub(super) struct KitRouters {
    pub(super) public: Router,
    pub(super) login: Router,
    pub(super) logout: Router,
    pub(super) admin: Router,
    pub(super) storage_api: Router,
    pub(super) prefs_api: Router,
    #[cfg(feature = "notify")]
    pub(super) notify_api: Router,
}

/// Whether a kit page is switched on for this app (Kenny, 2026-10-02:
/// every kit page is optional; a page switched off has no route, no data
/// endpoint and no entry in the navigation).
pub(super) fn page_on(disabled: &[String], id: &str) -> bool {
    !disabled.iter().any(|d| d == id)
}

/// The values of the synced preferences ride in every signed-in HTML page
/// (innermost, so the caller is known when it runs).
pub(super) fn inject(prefs: Option<&crate::storage::Prefs>, r: Router) -> Router {
    match prefs {
        Some(p) => r.layer(axum::middleware::from_fn_with_state(
            p.clone(),
            crate::storage::prefs_inject::inject,
        )),
        None => r,
    }
}

/// Public pages, login/logout, the admin pages and the data APIs.
pub(super) fn build(
    extra: &MountExtra,
    built: &Built,
    auth: &AuthState,
    login_limit: &IpLimit,
) -> KitRouters {
    let dash = &built.dash;
    let page_set = &built.page_set;
    let kit_renders = !extra.kit_in_webapp;
    let pages_public = Router::new()
        .route("/login", get(dashboard::login_get))
        // `{*name}`: the vendored fonts live under `static/fonts/…` (S8).
        .route("/static/{*name}", get(assets::serve_conditional))
        .with_state(dash.clone());
    let login = Router::new()
        .route("/login", post(dashboard::login_post))
        .layer(from_fn_with_state(login_limit.clone(), ip_rate_limit))
        .with_state(dash.clone());
    let logout = Router::new()
        .route("/logout", post(logout_handler))
        .with_state(auth.clone());
    // Kenny, 2026-10-02: every kit page is optional; a page switched off
    // has no route, no data endpoint and no entry in the navigation.
    let on = |id: &str| !extra.disabled.iter().any(|d| d == id);
    let (status_on, clients_on) = (on("status"), on("clients"));
    let storage_on = cfg!(feature = "storage") && on("storage");
    let mut pages_admin = Router::new();
    if status_on {
        pages_admin = pages_admin
            .route("/api/kit/status", get(dashboard::status_json))
            .route(
                "/api/kit/status/update-check",
                axum::routing::post(dashboard::update_check),
            );
    }
    if clients_on {
        pages_admin = pages_admin.route("/api/kit/clients", get(dashboard::clients_json));
    }
    if kit_renders && status_on {
        pages_admin = pages_admin.route("/status", get(dashboard::status_page));
    }
    if kit_renders && clients_on {
        pages_admin = pages_admin.route("/clients", get(dashboard::clients_page));
    }
    // 3.11.0: the Storage page. Its data is `/api/kit/storage` (below), so
    // the page and a project's own web app draw from one source.
    if kit_renders && storage_on {
        pages_admin = pages_admin.route("/storage", get(dashboard::storage_page));
    }
    // `/`: the web app's when it sits at the root; else the home route,
    // which is the status page itself unless the project named another.
    if !extra.webapp_at_root {
        if status_on && (page_set.home == "/status" || page_set.home == "/") {
            pages_admin = pages_admin.route("/", get(dashboard::status_page));
        } else {
            let to = page_set.home.clone();
            pages_admin = pages_admin.route(
                "/",
                get(move || async move { axum::response::Redirect::to(&to) }),
            );
        }
    }
    // 3.11.0: the Storage page's JSON API, behind the admin login and the
    // same-origin rule; the page itself is drawn from it.
    let storage_api = match extra.storage.as_ref().filter(|_| storage_on) {
        Some(st) => crate::storage::api::routes(st.clone())
            .layer(from_fn_with_state(auth.clone(), require_admin)),
        None => Router::new(),
    };
    #[cfg(feature = "notify")]
    let notify_api = match extra.notify.clone().filter(|_| status_on) {
        Some(n) => crate::shell::notify_api::routes(n)
            .layer(from_fn_with_state(auth.clone(), require_admin)),
        None => Router::new(),
    };
    let prefs_api = match extra.prefs.as_ref() {
        Some(p) => crate::storage::prefs_api::routes(p.clone())
            .layer(from_fn_with_state(auth.clone(), require_admin)),
        None => Router::new(),
    };
    let set_for_json = page_set.clone();
    let pages_admin = inject(extra.prefs.as_ref(), pages_admin.with_state(dash.clone()))
        .route(
            "/api/kit/pages",
            get(move || {
                let set = set_for_json.clone();
                async move {
                    (
                        [(axum::http::header::CACHE_CONTROL, "no-cache")],
                        axum::Json((*set).clone()),
                    )
                }
            }),
        )
        .layer(from_fn_with_state(auth.clone(), require_admin));
    KitRouters {
        public: pages_public,
        login,
        logout,
        admin: pages_admin,
        storage_api,
        prefs_api,
        #[cfg(feature = "notify")]
        notify_api,
    }
}

/// The clients API, behind the admin login; empty when the page is off.
pub(super) fn clients_router(
    disabled: &[String],
    api: ClientsApi,
    built: &Built,
    auth: &AuthState,
) -> Router {
    if !page_on(disabled, "clients") {
        return Router::new();
    }
    let vocab = built.vocab.clone();
    let vocab_article = built.vocab_article.clone();
    Router::new()
        .route(
            "/api/clients",
            get(clients_api::list).post(clients_api::issue_with_article),
        )
        .route("/api/clients/{id}", delete(clients_api::delete))
        .route("/api/clients/{id}/reissue", post(clients_api::reissue))
        .route("/api/clients/{id}/revoke", post(clients_api::revoke))
        .route("/api/clients/{id}/token", get(clients_api::reveal))
        .route("/api/clients/{id}/requests", get(clients_api::requests))
        .route("/api/clients/{id}/test", post(clients_api::send_test_body))
        .with_state(api)
        // K28: the handlers word their refusals in the project's vocabulary.
        .layer(axum::Extension(vocab))
        .layer(axum::Extension(clients_api::VocabArticle(vocab_article)))
        .layer(from_fn_with_state(auth.clone(), require_admin))
}
