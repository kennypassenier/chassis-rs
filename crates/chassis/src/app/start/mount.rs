//! Putting the router of a starting `App` together: the kit's own routes,
//! the dashboard mount (or the plain merge without one) and the layers
//! every route sits behind.

use axum::Router;
use axum::routing::get;

use super::super::App;
use super::stores::Stores;
use crate::core::error::Error;
use crate::shell::config_load::Loaded;
use crate::shell::guards::Guards;
use crate::shell::health::{self, Health};
use crate::shell::http::{AccessState, HtmlErrorRenderer, with_kit_layers};
use crate::shell::metrics::{Metrics, metrics_handler};

/// A flush hook, run once the server drained.
pub(super) type Flush = Box<dyn FnOnce() + Send>;

/// The routes mounted so far, the flush hooks they brought and the renderer
/// for browser-facing refusals.
pub(super) struct Mounted {
    pub(super) router: Router,
    pub(super) flushes: Vec<Flush>,
    pub(super) html_errors: Option<HtmlErrorRenderer>,
}

impl App {
    /// The project's router with `/healthz`, `/metrics` and, behind the
    /// login, the dashboard and API routes merged in.
    #[cfg_attr(not(feature = "dashboard"), allow(unused_variables))]
    pub(super) async fn mount_routes(
        &mut self,
        loaded: &Loaded,
        guards: &Guards,
        health: &Health,
        addr: std::net::SocketAddr,
        stores: &mut Stores,
        metrics: Metrics,
    ) -> Result<Mounted, Error> {
        let kit_routes = Router::new()
            .route("/healthz", get(health::healthz).with_state(health.clone()))
            .route("/metrics", get(metrics_handler).with_state(metrics));
        let router = std::mem::take(&mut self.router).merge(kit_routes);

        // CF-7: with a dashboard, refusals to browser navigations render in
        // its layout; without one every error stays JSON.
        #[cfg(feature = "dashboard")]
        let mut mounted = {
            let (protected, flush, html) = self
                .mount_dashboard(loaded, guards, health, addr, stores)
                .await?;
            Mounted {
                router: router.merge(protected),
                flushes: vec![flush],
                html_errors: Some(html),
            }
        };
        #[cfg(not(feature = "dashboard"))]
        let mut mounted = Mounted {
            router: router
                .merge(std::mem::take(&mut self.api_router))
                .merge(std::mem::take(&mut self.dashboard_router)),
            flushes: Vec::new(),
            html_errors: None,
        };

        if let Some(f) = self.flush.take() {
            mounted.flushes.push(f);
        }
        Ok(mounted)
    }

    /// The layers every route sits behind, innermost first: the backup
    /// pause, the project's request guards, the kit's guards and finally the
    /// trusted-admin mark.
    pub(super) fn layer_router(
        &mut self,
        router: Router,
        guards: Guards,
        access: AccessState,
        html_errors: Option<HtmlErrorRenderer>,
    ) -> Result<Router, Error> {
        // feat-backup-1: a full backup pause answers 503 before any route.
        let router = crate::shell::backup::full_pause_layer(router);
        // feat-guard-1: innermost of the kit's layers, so the proxy handling
        // has run and nothing else has: every route, the kit's own included.
        #[cfg(feature = "request-guard")]
        let router = crate::shell::request_guard::apply(
            router,
            std::mem::take(&mut self.request_guards),
            std::mem::take(&mut self.request_guard_exempt),
            guards.trusted_proxies.clone(),
        );
        let policy = crate::shell::http::policy::HeaderPolicy::new(
            &self.browser_features,
            guards.trusted_proxies.clone(),
        )?;
        let router = with_kit_layers(
            router,
            guards,
            access,
            self.limits.max_body_bytes,
            html_errors,
        )
        // Outside the kit's layers: every answer, errors included.
        .layer(axum::middleware::from_fn_with_state(
            policy,
            crate::shell::http::policy::policy_headers,
        ));
        // trusted-sources: outermost, so the error pages and every guard
        // inside see the mark.
        #[cfg(feature = "dashboard")]
        let router = {
            let trusted = crate::shell::trusted::TrustedAdmins::new(
                crate::shell::trusted::parse_trusted_admins(
                    self.loaded
                        .as_ref()
                        .and_then(|l| l.get("trusted_admins"))
                        .unwrap_or(""),
                    &self.limits.trusted_proxies,
                )?,
                self.limits.trusted_proxies.clone(),
            );
            if trusted.is_empty() {
                router
            } else {
                router.layer(axum::middleware::from_fn_with_state(
                    trusted,
                    crate::shell::trusted::mark,
                ))
            }
        };

        Ok(router)
    }
}
