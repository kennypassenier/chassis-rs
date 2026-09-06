//! Wiring for the `dashboard` feature (K8, K12–K17): stores, auth state,
//! the clients API, the HTML pages and the protected routers, assembled
//! once at start. Kept out of `app.rs` so a service without the feature
//! compiles none of it.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::middleware::from_fn_with_state;
use axum::routing::{delete, get, post};

use crate::app::{AppSpec, DashboardRegistry, Limits};
use crate::core::crypto::Key;
use crate::core::error::Error;
use crate::shell::assets;
use crate::shell::auth::{
    AuthState, Secrets, login_limit, logout_handler, require_admin, require_caller,
};
use crate::shell::captures::{CaptureConfig, Captures, capture_requests};
use crate::shell::clients_api::{self, ClientsApi, TestRoute};
use crate::shell::config_load::Loaded;
use crate::shell::dashboard::{self, Dashboard, Problem, UpdateView};
use crate::shell::guards::{Guards, ip_rate_limit};
use crate::shell::health::Health;
use crate::shell::store::{
    ClientStore, EncryptedFile, FileClientStore, MemoryClientStore, SessionStore,
};
use crate::shell::time::random_hex;

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
    let secrets = Secrets::parse(&prefix, loaded.get("token"), loaded.get("secret_key"))?;
    // The opt-in (AppSpec::open_dashboard): no secrets, no door. Nothing is
    // sealed — clients live in memory, no session is ever minted, passkeys
    // stay off — and every page carries the banner.
    let open = secrets.is_none() && spec.open_dashboard;
    if secrets.is_none() && !open {
        return Err(Error::config(
            format!(
                "the dashboard is compiled in but {prefix}_TOKEN and {prefix}_SECRET_KEY are not set"
            ),
            format!(
                "run `{} gen-secret` on a terminal and put both lines in the environment file; a dashboard never starts without a login unless the service opted in (AppSpec::open_dashboard)",
                spec.name
            ),
        ));
    }
    let seal_key = match &secrets {
        Some(s) => s.key.clone(),
        // Never used to write anything: the open store below is in memory
        // and no session is created without a login.
        None => Key::parse_hex("open", &random_hex(32)?, "")?,
    };

    let clients: Arc<dyn ClientStore> = match (client_store, open) {
        (_, true) => Arc::new(MemoryClientStore::default()),
        (Some(s), false) => s,
        (None, false) => Arc::new(FileClientStore::open(EncryptedFile::new(
            loaded.state_dir.join("clients.json.enc"),
            seal_key.clone(),
            "clients store",
        ))?),
    };
    // Open: a file name nothing ever writes (no login, no session), so a
    // sealed sessions file from a closed run is neither read nor touched.
    let sessions_file = if open {
        "sessions.open.json.enc"
    } else {
        "sessions.json.enc"
    };
    let sessions = Arc::new(SessionStore::open(EncryptedFile::new(
        loaded.state_dir.join(sessions_file),
        seal_key.clone(),
        "sessions store",
    ))?);

    let auth = AuthState {
        name: spec.name,
        secrets,
        clients: clients.clone(),
        sessions,
        session_ttl_secs: limits.session_ttl_secs,
        remember_me_secs: limits.remember_me_secs,
        guards: guards.clone(),
    };
    let captures = Captures::new(CaptureConfig {
        keep: limits.capture_keep,
        body_bytes: limits.capture_body_bytes,
        ttl: limits.capture_ttl,
        redact: limits.capture_redact.clone(),
    });
    let self_base_url = {
        let host = if addr.ip().is_unspecified() {
            "127.0.0.1".to_string()
        } else {
            addr.ip().to_string()
        };
        format!("http://{}:{}", host, addr.port())
    };
    let has_test_route = test_route.is_some();
    let api = ClientsApi {
        clients: clients.clone(),
        captures: captures.clone(),
        test_route: test_route.map(Arc::new),
        self_base_url,
    };
    let kit_guards = guards.clone();
    let token_limit =
        crate::shell::auth::token_limit(guards.clone(), limits.token_per_sec, limits.token_burst)?;
    let login_limit = login_limit(guards.clone(), limits.login_per_min, limits.login_burst)?;

    // Client usage (K13) is kept in memory and persisted debounced (#13).
    let persist_every = limits.clients_persist;
    let persist_clients = clients.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(persist_every.max(Duration::from_secs(1)));
        tick.tick().await;
        loop {
            tick.tick().await;
            if let Err(e) = persist_clients.persist() {
                tracing::warn!(error = %e, "could not persist client usage; retrying next tick");
            }
        }
    });
    let flush_clients = clients.clone();
    let flush: Box<dyn FnOnce() + Send> = Box::new(move || {
        if let Err(e) = flush_clients.persist() {
            tracing::warn!(error = %e, "client usage not persisted at shutdown");
        }
    });

    let project_problems = registry.problems.unwrap_or_else(|| Arc::new(Vec::new));
    let problems: Arc<dyn Fn() -> Vec<Problem> + Send + Sync> = Arc::new(move || {
        let mut v = project_problems();
        v.extend(kit_guards.problems().into_iter().map(|p| Problem {
            what: p.what,
            why: p.why,
            remedy: p.remedy,
        }));
        v
    });
    let update = registry
        .update
        .unwrap_or_else(|| Arc::new(UpdateView::default));
    let dash = Dashboard::new(
        spec.name,
        spec.version,
        prefix.clone(),
        addr.to_string(),
        registry.clients_label,
        crate::shell::time::reveal_seconds(loaded),
        limits.capture_body_bytes,
        limits.capture_ttl.as_secs() / 60,
        limits.remember_me_secs / 86_400,
        has_test_route,
        cfg!(feature = "passkeys") && !open,
        limits.public_url.clone().unwrap_or_default(),
        registry.nav,
        registry.sections,
        registry.columns,
        problems,
        update,
        health,
        clients,
        auth.clone(),
        open,
    )?;

    let pages_public = Router::new()
        .route("/login", get(dashboard::login_get))
        // `{*name}`: the vendored fonts live under `static/fonts/…` (S8).
        .route("/static/{*name}", get(assets::serve))
        .with_state(dash.clone());
    let login = Router::new()
        .route("/login", post(dashboard::login_post))
        .layer(from_fn_with_state(login_limit.clone(), ip_rate_limit))
        .with_state(dash.clone());
    let logout = Router::new()
        .route("/logout", post(logout_handler))
        .with_state(auth.clone());
    let pages_admin = Router::new()
        .route("/", get(dashboard::status_page))
        .route("/clients", get(dashboard::clients_page))
        .with_state(dash.clone())
        .layer(from_fn_with_state(auth.clone(), require_admin));

    let clients_api = Router::new()
        .route(
            "/api/clients",
            get(clients_api::list).post(clients_api::issue),
        )
        .route("/api/clients/{id}", delete(clients_api::delete))
        .route("/api/clients/{id}/reissue", post(clients_api::reissue))
        .route("/api/clients/{id}/revoke", post(clients_api::revoke))
        .route("/api/clients/{id}/token", get(clients_api::reveal))
        .route("/api/clients/{id}/requests", get(clients_api::requests))
        .route("/api/clients/{id}/test", post(clients_api::send_test))
        .with_state(api)
        .layer(from_fn_with_state(auth.clone(), require_admin));

    #[cfg(feature = "passkeys")]
    let passkey_routes = if open {
        Router::new()
    } else {
        use crate::shell::passkeys::{self, PasskeyState};
        let webauthn = passkeys::build_webauthn(spec.name, &prefix, limits.public_url.as_deref())?;
        let pk = PasskeyState::open(
            webauthn,
            auth.clone(),
            EncryptedFile::new(
                loaded.state_dir.join("passkeys.json.enc"),
                seal_key.clone(),
                "passkeys store",
            ),
            passkeys::CeremonyLimits {
                cap: limits.passkey_ceremony_cap,
                ttl: limits.passkey_ceremony_ttl,
                per_ip: limits.passkey_ceremonies_per_ip,
            },
            guards.clone(),
        )?;
        // S6: the same per-IP limiter as /login — an unauthenticated peer
        // gets login_burst ceremonies at once and login_per_min after that.
        let public = Router::new()
            .route("/passkeys/login/start", post(passkeys::login_start))
            .route("/passkeys/login/finish", post(passkeys::login_finish))
            .layer(from_fn_with_state(pk.clone(), passkeys::require_https))
            .with_state(pk.clone())
            .layer(from_fn_with_state(login_limit.clone(), ip_rate_limit));
        let admin_api = Router::new()
            .route("/passkeys/register/start", post(passkeys::register_start))
            .route("/passkeys/register/finish", post(passkeys::register_finish))
            .route("/api/passkeys", get(passkeys::list))
            .route("/api/passkeys/{id}", delete(passkeys::delete))
            .layer(from_fn_with_state(pk.clone(), passkeys::require_https))
            .with_state(pk.clone())
            .layer(from_fn_with_state(auth.clone(), require_admin));
        let page_state = (dash.clone(), pk);
        let page = Router::new()
            .route(
                "/passkeys",
                get(
                    |axum::extract::State((d, pk)): axum::extract::State<(
                        Dashboard,
                        PasskeyState,
                    )>,
                     axum::extract::ConnectInfo(peer): axum::extract::ConnectInfo<
                        std::net::SocketAddr,
                    >,
                     headers: axum::http::HeaderMap| async move {
                        let https = d.is_https(peer, &headers);
                        d.passkeys_page(https, pk.list())
                    },
                ),
            )
            .with_state(page_state)
            .layer(from_fn_with_state(auth.clone(), require_admin));
        public.merge(admin_api).merge(page)
    };

    // K16: a project's page handlers render inside the layout through the
    // `Dashboard` extension; admin login is required as for the kit's pages.
    let project_pages = dashboard_router
        .layer(axum::Extension(dash.clone()))
        .layer(from_fn_with_state(auth.clone(), require_admin));

    // Outermost first: identify the caller, then throttle it per token (K10,
    // H3), then capture the request for its row.
    let api_routes = api_router
        .layer(from_fn_with_state(captures, capture_requests))
        .layer(from_fn_with_state(
            token_limit,
            crate::shell::auth::token_rate_limit,
        ))
        .layer(from_fn_with_state(auth, require_caller));

    #[allow(unused_mut)]
    let mut all = pages_public
        .merge(login)
        .merge(logout)
        .merge(pages_admin)
        .merge(clients_api)
        .merge(project_pages)
        .merge(api_routes);
    #[cfg(feature = "passkeys")]
    {
        all = all.merge(passkey_routes);
    }
    let renderer_dash = dash.clone();
    let html: crate::shell::http::HtmlErrorRenderer = Arc::new(move |status, message, remedy| {
        renderer_dash.render_error(status, message, remedy)
    });
    Ok((all, flush, html))
}
