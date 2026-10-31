//! `WebApp::router`: how the app is mounted (root fallback or a mount path).
//! Its own module because routing is separate from validating and serving.

use std::sync::Arc;

use axum::Router;
use axum::http::Uri;
use axum::routing::get;

use super::WebApp;
use super::serving::{serve, serve_root};
use crate::core::error::Error;

impl WebApp {
    /// The routes, unprotected: the caller layers the login in front.
    pub(crate) fn router(self) -> Result<Router, Error> {
        Ok(crate::shell::compress::compressed(self.plain_router()?))
    }

    /// The routes before gzip is layered on.
    fn plain_router(self) -> Result<Router, Error> {
        self.validate()?;
        let mount = self.mount.clone();
        let state = Arc::new(self);
        if mount.is_empty() {
            // feat-pages-1: at the root the app is the fallback, so every
            // route the kit or the project registered wins and the app
            // answers the rest. `/app/...` from before 3.1.0 moves to the
            // same path at the root, so a bookmark keeps working.
            return Ok(Router::new()
                .route(
                    "/app",
                    get(|| async { axum::response::Redirect::permanent("/") }),
                )
                .route(
                    "/app/{*rest}",
                    get(|uri: Uri| async move {
                        let rest = uri.path().trim_start_matches("/app");
                        let to = match uri.query() {
                            Some(q) => format!("{rest}?{q}"),
                            None => rest.to_string(),
                        };
                        axum::response::Redirect::permanent(&to)
                    }),
                )
                .fallback(serve_root)
                .with_state(state));
        }
        // `/app` itself redirects to `/app/` so relative URLs in index.html
        // resolve under the mount.
        let slash = format!("{mount}/");
        let redirect_to = slash.clone();
        Ok(Router::new()
            .route(
                &mount,
                get(move || async move { axum::response::Redirect::permanent(&redirect_to) }),
            )
            .route(&slash, get(serve))
            .route(&format!("{mount}/{{*path}}"), get(serve))
            .with_state(state))
    }
}
