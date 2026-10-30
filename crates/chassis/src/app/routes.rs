//! Where a service mounts its own routes and web app: the token-protected API,
//! the admin pages, the static web app and the dashboard's test request.

use axum::Router;

use super::App;

impl App {
    /// Routes that need `Authorization: Bearer <client token>` (or the
    /// login token). Requests here are captured per client (K13).
    pub fn api_routes(&mut self, router: Router) -> &mut Self {
        self.api_router = self.api_router.clone().merge(router);
        self
    }

    /// Routes only a logged-in admin may open (dashboard pages, L4).
    pub fn dashboard_routes(&mut self, router: Router) -> &mut Self {
        self.dashboard_router = self.dashboard_router.clone().merge(router);
        self
    }

    /// feat-webapp-1: serve a static browser app (HTML, ES modules, CSS)
    /// under its mount path (`/app` unless [`WebApp::at`] says otherwise),
    /// behind the admin login like the kit's own pages. A mount that would
    /// hide a kit route, or an app without `index.html`, is refused at
    /// start and at `--check`.
    ///
    /// [`WebApp::at`]: crate::shell::webapp::WebApp::at
    #[cfg(feature = "webapp")]
    pub fn webapp(&mut self, app: crate::shell::webapp::WebApp) -> &mut Self {
        self.webapp = Some(app);
        self
    }

    /// Where the dashboard's "send a test request" button posts (K14).
    #[cfg(feature = "dashboard")]
    pub fn test_route(
        &mut self,
        method: &str,
        path: &str,
        content_type: &str,
        body: &str,
    ) -> &mut Self {
        self.test_route = Some(crate::shell::clients_api::TestRoute {
            path: path.to_string(),
            method: method.to_string(),
            content_type: content_type.to_string(),
            body: body.to_string(),
        });
        self
    }
}
