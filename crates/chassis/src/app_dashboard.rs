//! Wiring for the `dashboard` feature (K8, K12–K17): stores, auth state,
//! the clients API, the HTML pages and the protected routers, assembled
//! once at start. Kept out of `app.rs` so a service without the feature
//! compiles none of it. The stages live in child modules; `mount_with`
//! reads as the sequence.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::middleware::from_fn_with_state;

use crate::app::{AppSpec, DashboardRegistry, Limits};
use crate::core::crypto::Key;
use crate::core::error::Error;
use crate::shell::auth::{AuthState, login_limit, require_admin, require_caller};
use crate::shell::captures::capture_requests;
use crate::shell::clients_api::TestRoute;
use crate::shell::config_load::Loaded;
use crate::shell::guards::Guards;
use crate::shell::health::Health;
use crate::shell::store::ClientStore;

mod clients_state;
mod dashboard_build;
mod door;
mod kit_routes;
#[cfg(feature = "passkeys")]
mod passkey_routes;
mod stores;

/// Everything `mount` needs from the App.
pub struct MountInput<'a> {
    pub spec: &'a AppSpec,
    pub loaded: &'a Loaded,
    pub limits: &'a Limits,
    pub guards: Guards,
    pub addr: SocketAddr,
    pub api_router: Router,
    pub dashboard_router: Router,
    pub test_route: Option<TestRoute>,
    pub client_store: Option<Arc<dyn ClientStore>>,
    pub registry: DashboardRegistry,
    pub health: Health,
}

/// Build everything the dashboard feature adds to the router. Returns the
/// routes to merge and the flush hook that persists client usage at stop.
/// What mounting the dashboard hands back: the protected router, the
/// flush hook for the stores, and the renderer that turns a kit error into
/// a page in the layout (CF-7).
pub type Mounted = (
    Router,
    Box<dyn FnOnce() + Send>,
    crate::shell::http::HtmlErrorRenderer,
);

pub async fn mount(input: MountInput<'_>) -> Result<Mounted, Error> {
    mount_with(input, MountExtra::default()).await
}

/// feat-pages-1: what the App hands `mount` beyond [`MountInput`], kept
/// out of that public struct so adding to it never breaks a caller.
#[derive(Default)]
pub(crate) struct MountExtra {
    pub pages: Vec<crate::shell::pages::Page>,
    pub kit_edits: Vec<(String, crate::shell::pages::KitPageEdit)>,
    pub brand: Option<String>,
    pub brand_title: Option<String>,
    pub home: Option<String>,
    pub webapp_at_root: bool,
    pub kit_in_webapp: bool,
    /// feat-webapp-4: the web app's public install routes (manifest, worker,
    /// icons), merged outside the login, and the tags that link the manifest
    /// from the kit's own pages (the login page).
    pub pwa_routes: Option<Router>,
    pub pwa_head: Option<String>,
    /// Kenny, 2026-10-02: every kit page is optional per app.
    pub disabled: Vec<String>,
    /// 3.11.0: the budget monitor and the app database; its problems join
    /// the status page.
    #[cfg(feature = "storage")]
    pub storage: Option<crate::storage::Storage>,
    /// 3.12.0: the synced browser preferences; their routes join the admin
    /// API and every signed-in HTML page carries them.
    pub prefs: Option<crate::storage::Prefs>,
    /// 3.15.0: the notification channel behind the Status card.
    #[cfg(feature = "notify")]
    pub notify: Option<crate::shell::notify_api::NotifyState>,
    /// habits-push-1: the app's push handle, connected at mount.
    #[cfg(feature = "push")]
    pub push: Option<crate::push::PushHandle>,
}

/// Everything the mount stages share: the app's identity and limits, the
/// listening address and the login decision.
struct Ctx<'a> {
    spec: &'a AppSpec,
    loaded: &'a Loaded,
    limits: &'a Limits,
    prefix: String,
    addr: SocketAddr,
    guards: Guards,
    health: Health,
    open: bool,
    #[cfg_attr(not(feature = "passkeys"), allow(dead_code))]
    seal_key: Key,
}

/// Whether the passkey routes and page are on: compiled in, the dashboard
/// is not open and the page is not switched off.
fn passkeys_wanted(open: bool, disabled: &[String]) -> bool {
    cfg!(feature = "passkeys") && !open && !disabled.iter().any(|d| d == "passkeys")
}

pub(crate) async fn mount_with(
    input: MountInput<'_>,
    mut extra: MountExtra,
) -> Result<Mounted, Error> {
    let MountInput {
        spec,
        loaded,
        limits,
        guards,
        addr,
        api_router,
        dashboard_router,
        test_route,
        client_store,
        registry,
        health,
    } = input;
    let prefix = spec.prefix();
    let mut door = door::Door::resolve(spec, loaded, &prefix)?;
    let stores = stores::open(spec, loaded, &door, client_store, &extra)?;
    let ctx = Ctx {
        spec,
        loaded,
        limits,
        prefix,
        addr,
        guards,
        health,
        open: door.open,
        seal_key: door.seal_key.clone(),
    };
    let auth = AuthState {
        name: spec.name,
        secrets: door.secrets.take(),
        clients: stores.clients.clone(),
        sessions: stores.sessions.clone(),
        session_ttl_secs: limits.session_ttl_secs,
        remember_me_secs: limits.remember_me_secs,
        guards: ctx.guards.clone(),
    };
    let captures = clients_state::captures(&ctx);
    let (api, hints) = clients_state::api(&ctx, test_route, &registry, &stores.clients, &captures);
    let token_limit = crate::shell::auth::token_limit(
        ctx.guards.clone(),
        limits.token_per_sec,
        limits.token_burst,
    )?;
    let login_limit = login_limit(ctx.guards.clone(), limits.login_per_min, limits.login_burst)?;
    let flush = clients_state::spawn_persistence(&stores.clients, limits.clients_persist);

    let built = dashboard_build::build(
        &ctx,
        &mut extra,
        registry,
        hints,
        stores.clients.clone(),
        &auth,
    )?;
    let kit = kit_routes::build(&extra, &built, &auth, &login_limit);
    let clients_api = kit_routes::clients_router(&extra.disabled, api, &built, &auth);
    // habits-push-1: Web Push, behind the admin login (empty when it is off).
    #[cfg(feature = "push")]
    let push_api = match (
        extra.push.as_ref(),
        extra.storage.as_ref().and_then(|s| s.kit_db()),
    ) {
        (Some(handle), Some(kit_db)) => crate::push::mount::mount(crate::push::mount::PushInput {
            loaded: ctx.loaded,
            kit: kit_db,
            seal_key: &ctx.seal_key,
            open: ctx.open,
            handle,
            auth: &auth,
        })?,
        _ => Router::new(),
    };
    #[cfg(feature = "passkeys")]
    let passkey_routes = passkey_routes::routes(
        &ctx,
        &extra.disabled,
        !extra.kit_in_webapp,
        &auth,
        &built.dash,
        &stores,
        &login_limit,
    )?;

    // K16: a project's page handlers render inside the layout through the
    // `Dashboard` extension; admin login is required as for the kit's pages.
    // feat-live-1: the auth state rides along so a live stream can ask again
    // later whether its caller is still logged in.
    let project_pages = kit_routes::inject(
        extra.prefs.as_ref(),
        dashboard_router
            .layer(axum::Extension(built.dash.clone()))
            .layer(axum::Extension(auth.clone())),
    )
    .layer(from_fn_with_state(auth.clone(), require_admin));

    // Outermost first: identify the caller, then throttle it per token (K10,
    // H3), then capture the request for its row.
    let api_routes = api_router
        .layer(axum::Extension(auth.clone()))
        .layer(from_fn_with_state(captures, capture_requests))
        .layer(from_fn_with_state(
            token_limit,
            crate::shell::auth::token_rate_limit,
        ))
        .layer(from_fn_with_state(auth, require_caller));

    #[allow(unused_mut)]
    let mut all = kit
        .public
        .merge(kit.login)
        .merge(kit.logout)
        .merge(kit.admin)
        .merge(clients_api)
        .merge(kit.storage_api)
        .merge(kit.prefs_api)
        .merge(project_pages)
        .merge(api_routes);
    if let Some(pwa) = extra.pwa_routes.take() {
        all = all.merge(pwa);
    }
    #[cfg(feature = "notify")]
    {
        all = all.merge(kit.notify_api);
    }
    #[cfg(feature = "push")]
    {
        all = all.merge(push_api);
    }
    #[cfg(feature = "passkeys")]
    {
        all = all.merge(passkey_routes);
    }
    let renderer_dash = built.dash.clone();
    let html: crate::shell::http::HtmlErrorRenderer = Arc::new(move |status, message, remedy| {
        renderer_dash.render_error(status, message, remedy)
    });
    Ok((all, flush, html))
}
