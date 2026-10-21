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
    /// Kenny, 2026-10-02: every kit page is optional per app.
    pub disabled: Vec<String>,
    /// 3.11.0: the budget monitor and the app database; its problems join
    /// the status page.
    #[cfg(feature = "storage")]
    pub storage: Option<crate::storage::Storage>,
    /// 3.12.0: the synced browser preferences; their routes join the admin
    /// API and every signed-in HTML page carries them.
    pub prefs: Option<crate::storage::Prefs>,
}

pub(crate) async fn mount_with(input: MountInput<'_>, extra: MountExtra) -> Result<Mounted, Error> {
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

    // 3.11.0: the kit's own stores live in `<name>-kit.db`, secrets sealed
    // per field with the same key. The old sealed JSON files move in once,
    // in one transaction; if that fails nothing is written and the kit runs
    // on the old files (with a problem on the status page) until it works.
    let kit_handle = match extra.storage.as_ref().and_then(|s| s.kit_db().cloned()) {
        Some(db) => db,
        None => crate::storage::Db::open(
            &loaded
                .state_dir
                .join(crate::storage::kit_file_name(spec.name)),
            &crate::storage::kit_migrations(),
        )?,
    };
    let kit = crate::storage::KitDb::new(kit_handle, seal_key.clone());
    let passkeys_wanted =
        cfg!(feature = "passkeys") && !open && !extra.disabled.iter().any(|d| d == "passkeys");
    // Open: a file name nothing ever writes (no login, no session), so a
    // sealed sessions file from a closed run is neither read nor touched.
    let sessions_file = if open {
        "sessions.open.json.enc"
    } else {
        "sessions.json.enc"
    };
    let kit_import = kit.import_legacy(&crate::storage::ImportPlan {
        state_dir: loaded.state_dir.clone(),
        clients: client_store.is_none() && !open,
        sessions_file,
        passkeys: passkeys_wanted,
    });
    let use_db = match kit_import {
        Ok(_) => true,
        Err(e) => {
            tracing::error!(error = %e, "the kit stores could not move into the kit database; nothing was written and the old files stay in use, the move is retried at the next start");
            if let Some(st) = &extra.storage {
                st.add_problem(crate::storage::StorageProblem {
                    what: "the clients, sessions and passkeys could not move into the kit database"
                        .into(),
                    why: format!(
                        "{}. Nothing was written; the service keeps using its old files",
                        e.message
                    ),
                    remedy: format!("{}; the move is retried at the next start", e.remedy),
                });
            }
            false
        }
    };
    if let Some(st) = &extra.storage {
        let prune_kit = kit.clone();
        st.set_kit_prune(Arc::new(move || {
            prune_kit.prune_expired_sessions(crate::shell::time::now_epoch())
        }));
    }

    let clients: Arc<dyn ClientStore> = match (client_store, open) {
        (_, true) => Arc::new(MemoryClientStore::default()),
        (Some(s), false) => s,
        (None, false) if use_db => Arc::new(crate::shell::store::DbClientStore::open(kit.clone())?),
        (None, false) => Arc::new(FileClientStore::open(EncryptedFile::new(
            loaded.state_dir.join("clients.json.enc"),
            seal_key.clone(),
            "clients store",
        ))?),
    };
    let sessions = Arc::new(if use_db {
        SessionStore::open_db(kit.clone())?
    } else {
        SessionStore::open(EncryptedFile::new(
            loaded.state_dir.join(sessions_file),
            seal_key.clone(),
            "sessions store",
        ))?
    });

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
    let test_body = test_route
        .as_ref()
        .map(|t| (t.body.clone(), t.content_type.clone()))
        .unwrap_or_default();
    let command_template = clients_api::command_template(
        &self_base_url,
        test_route.as_ref().map(|t| t.path.as_str()),
        &registry.vocabulary.clone().unwrap_or_default(),
    );
    let api = ClientsApi {
        clients: clients.clone(),
        captures: captures.clone(),
        test_route: test_route.map(Arc::new),
        self_base_url,
        on_issued: registry.on_client_issued.clone(),
        on_deleted: registry.on_client_deleted.clone(),
        declared_fields: Arc::new(
            registry
                .form_fields
                .iter()
                .map(|f| f.name.clone())
                .collect(),
        ),
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
    #[cfg(feature = "storage")]
    let storage_for_problems = extra.storage.clone();
    let problems: Arc<dyn Fn() -> Vec<Problem> + Send + Sync> = Arc::new(move || {
        let mut v = project_problems();
        #[cfg(feature = "storage")]
        if let Some(st) = &storage_for_problems {
            v.extend(st.problems().into_iter().map(|p| Problem {
                what: p.what,
                why: p.why,
                remedy: p.remedy,
            }));
        }
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
    // K28: an explicit label wins; otherwise the page is named after the
    // vocabulary ("Sources"), which is "Clients" by default.
    let vocab = registry.vocabulary.unwrap_or_default();
    // kit-r4: "a"/"an" by the word's sound unless the service overrides it.
    let vocab_article: Arc<str> = registry
        .vocabulary_article
        .filter(|a| !a.is_empty())
        .map(Arc::from)
        .unwrap_or_else(|| Arc::from(crate::shell::dashboard::article_for(&vocab.singular)));
    let clients_label = registry
        .clients_label
        .or_else(|| Some(vocab.plural_cap.clone()));
    let dash = Dashboard::new(
        spec.name,
        spec.version,
        prefix.clone(),
        addr.to_string(),
        clients_label,
        crate::shell::time::reveal_seconds(loaded),
        limits.capture_body_bytes,
        limits.capture_ttl.as_secs() / 60,
        limits.remember_me_secs / 86_400,
        has_test_route,
        cfg!(feature = "passkeys") && !open && !extra.disabled.iter().any(|d| d == "passkeys"),
        limits.public_url.clone().unwrap_or_default(),
        registry.nav.clone(),
        registry.sections,
        registry.columns,
        registry.form_fields,
        problems,
        update,
        health,
        clients,
        auth.clone(),
        open,
    )?
    .with_vocabulary(vocab.clone())
    .with_vocabulary_article(&vocab_article)
    .with_client_actions(registry.client_actions)
    .with_update_check(registry.check_update)
    .with_repository(spec.repository)
    .with_command_template(command_template)
    .with_test_body(test_body.0, &test_body.1);

    // feat-pages-1: one list of pages for every navigation. `nav_entry`
    // links from before 3.1.0 join it as visible project pages.
    let mut app_pages = extra.pages;
    for (i, n) in registry.nav.iter().enumerate() {
        app_pages.push(crate::shell::pages::Page::new(
            &format!("nav-{i}"),
            &n.label,
            &n.href,
        ));
    }
    let page_set = Arc::new(
        crate::shell::pages::Registry {
            app_pages,
            kit_edits: extra.kit_edits,
            disabled: extra.disabled.clone(),
            brand: extra.brand,
            brand_title: extra.brand_title,
            home: extra.home,
        }
        .build(
            spec.name,
            &dash.clients_label,
            dash.passkeys_enabled,
            cfg!(feature = "storage") && !extra.disabled.iter().any(|d| d == "storage"),
            extra.webapp_at_root,
            extra.kit_in_webapp,
        ),
    );
    let dash = dash.with_pages(&page_set);
    dash.spawn_uptime_sampler();
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
    let prefs_api = match extra.prefs.as_ref() {
        Some(p) => crate::storage::prefs_api::routes(p.clone())
            .layer(from_fn_with_state(auth.clone(), require_admin)),
        None => Router::new(),
    };
    let set_for_json = page_set.clone();
    let pages_admin = pages_admin
        .with_state(dash.clone())
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

    let clients_api = if !clients_on {
        Router::new()
    } else {
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
    };

    #[cfg(feature = "passkeys")]
    let passkey_routes = if open || !on("passkeys") {
        Router::new()
    } else {
        use crate::shell::passkeys::{self, PasskeyState};
        use axum::routing::patch;
        let webauthn = passkeys::build_webauthn(spec.name, &prefix, limits.public_url.as_deref())?;
        let ceremony_limits = passkeys::CeremonyLimits {
            cap: limits.passkey_ceremony_cap,
            ttl: limits.passkey_ceremony_ttl,
            per_ip: limits.passkey_ceremonies_per_ip,
        };
        let pk = if use_db {
            PasskeyState::open_db(
                webauthn,
                auth.clone(),
                kit.clone(),
                ceremony_limits,
                guards.clone(),
            )?
        } else {
            PasskeyState::open(
                webauthn,
                auth.clone(),
                EncryptedFile::new(
                    loaded.state_dir.join("passkeys.json.enc"),
                    seal_key.clone(),
                    "passkeys store",
                ),
                ceremony_limits,
                guards.clone(),
            )?
        };
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
            .route("/api/passkeys", get(passkeys::list_current))
            .route(
                "/api/passkeys/{id}",
                delete(passkeys::delete).patch(passkeys::rename),
            )
            .route("/api/kit/passkeys/{id}", patch(passkeys::rename))
            .layer(from_fn_with_state(pk.clone(), passkeys::require_https))
            .with_state(pk.clone())
            .layer(from_fn_with_state(auth.clone(), require_admin));
        let page_state = (dash.clone(), pk);
        let kit_page_route = Router::new().route(
            "/passkeys",
            get(
                |axum::extract::State((d, pk)): axum::extract::State<(Dashboard, PasskeyState)>,
                 axum::extract::ConnectInfo(peer): axum::extract::ConnectInfo<
                    std::net::SocketAddr,
                >,
                 headers: axum::http::HeaderMap| async move {
                    let https = d.is_https(peer, &headers);
                    d.passkeys_page(https, pk.list_for_request(&headers).await)
                },
            ),
        );
        // feat-pages-1: the same data for a web app that draws the page.
        let json_route = Router::new().route(
            "/api/kit/passkeys",
            get(
                |axum::extract::State((d, pk)): axum::extract::State<(Dashboard, PasskeyState)>,
                 axum::extract::ConnectInfo(peer): axum::extract::ConnectInfo<
                    std::net::SocketAddr,
                >,
                 headers: axum::http::HeaderMap| async move {
                    (
                        [(axum::http::header::CACHE_CONTROL, "no-cache")],
                        axum::Json(serde_json::json!({
                            "https": d.is_https(peer, &headers),
                            "public_url": d.public_url,
                            "passkeys": pk.list_for_request(&headers).await,
                        })),
                    )
                },
            ),
        );
        let page = if kit_renders {
            kit_page_route.merge(json_route)
        } else {
            json_route
        }
        .with_state(page_state)
        .layer(from_fn_with_state(auth.clone(), require_admin));
        public.merge(admin_api).merge(page)
    };

    // K16: a project's page handlers render inside the layout through the
    // `Dashboard` extension; admin login is required as for the kit's pages.
    // feat-live-1: the auth state rides along so a live stream can ask again
    // later whether its caller is still logged in.
    let project_pages = dashboard_router
        .layer(axum::Extension(dash.clone()))
        .layer(axum::Extension(auth.clone()))
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
    let mut all = pages_public
        .merge(login)
        .merge(logout)
        .merge(pages_admin)
        .merge(clients_api)
        .merge(storage_api)
        .merge(prefs_api)
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
