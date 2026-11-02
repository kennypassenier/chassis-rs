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
    /// Call it again for a second web app at another mount. Only one of
    /// them may be installable ([`WebApp::without_pwa`] on the others): the
    /// whole service is the installed app, and a second manifest would
    /// contradict the first. Two installable ones are refused at start.
    ///
    /// [`WebApp::without_pwa`]: crate::shell::webapp::WebApp::without_pwa
    ///
    /// [`WebApp::at`]: crate::shell::webapp::WebApp::at
    #[cfg(feature = "webapp")]
    pub fn webapp(&mut self, app: crate::shell::webapp::WebApp) -> &mut Self {
        self.webapp.push(app);
        self
    }

    /// The head markup for a page the project renders itself, so it joins
    /// the installed app (manifest link, colours, icons, and the script that
    /// registers the service worker); `None` before a web app is registered
    /// or when none is installable. Only for a page that writes its whole
    /// HTML itself: the kit's own pages, every page rendered through the kit
    /// layout (`render_project`) and the web app's files already carry these
    /// tags, so adding it there would print them twice.
    #[cfg(feature = "webapp")]
    pub fn pwa_page_head(&self) -> Option<String> {
        self.webapp.iter().find_map(|w| w.pwa_page_head())
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
