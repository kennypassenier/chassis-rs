//! The clients API state of the dashboard: the capture settings, the test
//! route and the command template the clients page shows, and the flush
//! and debounced persistence of client usage (K13).

use std::sync::Arc;
use std::time::Duration;

use super::Ctx;
use crate::app::DashboardRegistry;
use crate::shell::captures::{CaptureConfig, Captures};
use crate::shell::clients_api::{self, ClientsApi, TestRoute};
use crate::shell::store::ClientStore;

/// What the dashboard page needs to know about the clients API.
pub(super) struct Hints {
    pub(super) has_test_route: bool,
    pub(super) test_body: (String, String),
    pub(super) command_template: String,
}

/// The request-capture store, from the limits.
pub(super) fn captures(ctx: &Ctx) -> Captures {
    let limits = ctx.limits;
    Captures::new(CaptureConfig {
        keep: limits.capture_keep,
        body_bytes: limits.capture_body_bytes,
        ttl: limits.capture_ttl,
        redact: limits.capture_redact.clone(),
    })
}

/// The clients API state and the hints for the pages.
pub(super) fn api(
    ctx: &Ctx,
    test_route: Option<TestRoute>,
    registry: &DashboardRegistry,
    clients: &Arc<dyn ClientStore>,
    captures: &Captures,
) -> (ClientsApi, Hints) {
    let addr = ctx.addr;
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
    (
        api,
        Hints {
            has_test_route,
            test_body,
            command_template,
        },
    )
}

/// Client usage (K13) is kept in memory and persisted debounced (#13);
/// returns the hook that persists once more at shutdown.
pub(super) fn spawn_persistence(
    clients: &Arc<dyn ClientStore>,
    persist_every: Duration,
) -> Box<dyn FnOnce() + Send> {
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
    flush
}
