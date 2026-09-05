//! Wiring for the `dashboard` feature (K8, K12, K13, K14): stores, auth
//! state, the clients API and the protected routers, assembled once at
//! start. Kept out of `app.rs` so a service without the feature compiles
//! none of it.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::middleware::from_fn_with_state;
use axum::routing::{delete, get, post};

use crate::app::{AppSpec, Limits};
use crate::core::error::Error;
use crate::shell::auth::{
    AuthState, Secrets, login_handler, login_limit, logout_handler, require_admin, require_caller,
};
use crate::shell::captures::{CaptureConfig, Captures, capture_requests};
use crate::shell::clients_api::{self, ClientsApi, TestRoute};
use crate::shell::config_load::Loaded;
use crate::shell::guards::{Guards, ip_rate_limit};
use crate::shell::store::{ClientStore, EncryptedFile, FileClientStore, SessionStore};

/// Build everything the dashboard feature adds to the router. Returns the
/// routes to merge and the flush hook that persists client usage at stop.
#[allow(clippy::too_many_arguments)]
pub async fn mount(
    spec: &AppSpec,
    loaded: &Loaded,
    limits: &Limits,
    guards: Guards,
    addr: SocketAddr,
    api_router: Router,
    dashboard_router: Router,
    test_route: Option<TestRoute>,
    client_store: Option<Arc<dyn ClientStore>>,
) -> Result<(Router, Box<dyn FnOnce() + Send>), Error> {
    let prefix = spec.prefix();
    let secrets = Secrets::parse(&prefix, loaded.get("token"), loaded.get("secret_key"))?.ok_or_else(|| {
        Error::config(
            format!("the dashboard is compiled in but {prefix}_TOKEN and {prefix}_SECRET_KEY are not set"),
            format!("run `{} gen-secret` on a terminal and put both lines in the environment file; a dashboard never starts without a login (W6)", spec.name),
        )
    })?;

    let clients: Arc<dyn ClientStore> = match client_store {
        Some(s) => s,
        None => Arc::new(FileClientStore::open(EncryptedFile::new(
            loaded.state_dir.join("clients.json.enc"),
            secrets.key.clone(),
            "clients store",
        ))?),
    };
    let sessions = Arc::new(SessionStore::open(EncryptedFile::new(
        loaded.state_dir.join("sessions.json.enc"),
        secrets.key.clone(),
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
    let api = ClientsApi {
        clients: clients.clone(),
        captures: captures.clone(),
        test_route: test_route.map(Arc::new),
        self_base_url,
    };
    let login_limit = login_limit(guards, limits.login_per_min, limits.login_burst)?;

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

    let login = Router::new()
        .route("/login", post(login_handler))
        .layer(from_fn_with_state(login_limit, ip_rate_limit))
        .with_state(auth.clone());
    let logout = Router::new()
        .route("/logout", post(logout_handler))
        .with_state(auth.clone());

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

    let dashboard = dashboard_router.layer(from_fn_with_state(auth.clone(), require_admin));

    let api_routes = api_router
        .layer(from_fn_with_state(captures, capture_requests))
        .layer(from_fn_with_state(auth, require_caller));

    Ok((
        login
            .merge(logout)
            .merge(clients_api)
            .merge(dashboard)
            .merge(api_routes),
        flush,
    ))
}
