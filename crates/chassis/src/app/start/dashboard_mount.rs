//! Mounting the dashboard on a starting `App`: the page checks, the
//! optional web app and the hand-over to `app_dashboard::mount_with`.

use axum::Router;

use super::super::App;
use super::mount::Flush;
use super::stores::Stores;
use crate::core::error::Error;
use crate::shell::config_load::Loaded;
use crate::shell::guards::Guards;
use crate::shell::health::Health;
use crate::shell::http::HtmlErrorRenderer;

impl App {
    /// Mount the admin pages, the API and the project's own pages behind
    /// the login; returns the protected router, the dashboard's flush hook
    /// and the renderer for browser-facing refusals.
    pub(super) async fn mount_dashboard(
        &mut self,
        loaded: &Loaded,
        guards: &Guards,
        health: &Health,
        addr: std::net::SocketAddr,
        stores: &mut Stores,
    ) -> Result<(Router, Flush, HtmlErrorRenderer), Error> {
        // feat-webapp-1: the project's browser app joins the project's
        // own pages, so the mount puts the same admin login in front.
        #[cfg(feature = "webapp")]
        let webapp_at_root = self.webapp.as_ref().is_some_and(|w| w.at_root());
        #[cfg(not(feature = "webapp"))]
        let webapp_at_root = false;
        self.validate_pages(webapp_at_root)?;
        let (dashboard_router, pwa_routes, pwa_head) = self.dashboard_with_webapp()?;
        crate::app_dashboard::mount_with(
            crate::app_dashboard::MountInput {
                spec: &self.spec,
                loaded,
                limits: &self.limits,
                guards: guards.clone(),
                addr,
                api_router: std::mem::take(&mut self.api_router),
                dashboard_router,
                test_route: self.test_route.clone(),
                client_store: self.client_store.clone(),
                registry: std::mem::take(&mut self.dash),
                health: health.clone(),
            },
            crate::app_dashboard::MountExtra {
                pages: std::mem::take(&mut self.pages),
                kit_edits: std::mem::take(&mut self.kit_page_edits),
                brand: self.brand.take(),
                brand_title: self.brand_title.take(),
                disabled: std::mem::take(&mut self.disabled_kit_pages),
                home: self.home.take(),
                webapp_at_root,
                kit_in_webapp: self.kit_pages_in_webapp,
                pwa_routes,
                pwa_head,
                #[cfg(feature = "storage")]
                storage: Some(stores.storage.clone()),
                prefs: stores.prefs.clone(),
                #[cfg(feature = "notify")]
                notify: stores.notify_state.take(),
                #[cfg(feature = "push")]
                push: Some(self.push.clone()),
            },
        )
        .await
    }

    /// The project's pages are well formed, only kit pages that exist are
    /// disabled, and `kit_pages_in_webapp` has a web app at the root to
    /// live in.
    fn validate_pages(&self, webapp_at_root: bool) -> Result<(), Error> {
        crate::shell::pages::validate(&self.pages)?;
        if let Some(bad) = self
            .disabled_kit_pages
            .iter()
            .find(|d| !crate::shell::pages::KIT_PAGES.contains(&d.as_str()))
        {
            return Err(Error::config(
                format!("disable_kit_page(\"{bad}\"): the kit has no such page"),
                "use one of: status, clients, passkeys, storage",
            ));
        }
        if self.kit_pages_in_webapp && !webapp_at_root {
            return Err(Error::config(
                "kit_pages_in_webapp() needs a web app at the root",
                "register WebApp::embedded(FILES) without .at(…), or drop kit_pages_in_webapp()",
            ));
        }
        Ok(())
    }

    /// The dashboard router with the project's web app merged in, plus the
    /// app's public install routes and the tags for the kit's own pages
    /// (feat-webapp-4; the routes must sit outside the login).
    #[allow(clippy::type_complexity)]
    fn dashboard_with_webapp(&mut self) -> Result<(Router, Option<Router>, Option<String>), Error> {
        let dashboard_router = std::mem::take(&mut self.dashboard_router);
        #[cfg(feature = "webapp")]
        if let Some(w) = self.webapp.take() {
            let brand = self
                .brand_title
                .clone()
                .unwrap_or_else(|| self.spec.name.to_string());
            let (routes, head) = (w.pwa_router(&brand), w.pwa_head_html());
            return Ok((dashboard_router.merge(w.router()?), routes, head));
        }
        Ok((dashboard_router, None, None))
    }
}
