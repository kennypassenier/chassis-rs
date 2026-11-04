//! A page's data in one read, each part on its own (kyu, Almanac 40).
//!
//! A page that draws several parts (a list, a count, the kit's status) used
//! to make one request per part, or one hand-written handler that read them
//! all and answered 500 when one failed. [`PageData`] names each part once
//! and gives two routes for them:
//!
//! - `GET <path>`: every part, read side by side, in one answer
//!   `{"parts": {"<name>": {"data": …} | {"error", "remedy", "status"}}}`,
//!   always 200: a failing part is that part's error, the others still draw;
//! - `GET <path>/<name>`: one part as a plain JSON answer (its own status on
//!   an error), for a page that re-reads only what moved.
//!
//! The routes go wherever the app puts the router (`dashboard_routes` for a
//! logged-in page, `api_routes` for a client), so the auth is the app's. The
//! browser half is `window.chassisPageData` (static/chassis/page-data.js).
//! Kenny's scope rule: bundling is the app's choice; this only spares each
//! app the same handler.

mod part;
#[cfg(test)]
mod tests;

use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::extract::Path;
use axum::routing::get;

pub use part::PartResult;
use part::{Part, read_all, read_one};

/// How long one part may take before it is answered as an error.
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);

/// The named parts of one page's data and the routes that serve them.
#[derive(Clone)]
pub struct PageData {
    path: String,
    parts: Vec<Part>,
    timeout: Duration,
}

impl PageData {
    /// The parts served at `path` (`/api/stacks/page`) and `path/<name>`.
    pub fn new(path: impl Into<String>) -> Self {
        Self {
            path: path.into().trim_end_matches('/').to_string(),
            parts: Vec::new(),
            timeout: DEFAULT_TIMEOUT,
        }
    }

    /// A part: `read` is called for every request that wants it, and its
    /// `Ok` value is the part's `data`. Names are unique; a second part of
    /// the same name panics at setup (a programming error, found at start).
    pub fn part<F, Fut>(mut self, name: &str, read: F) -> Self
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = PartResult> + Send + 'static,
    {
        assert!(
            !self.parts.iter().any(|p| p.name == name),
            "page data {}: the part {name:?} is named twice; give each part its own name",
            self.path
        );
        self.parts.push(Part::new(name, read));
        self
    }

    /// How long a part may take (default 10 s); a slower one answers as an
    /// error with a remedy, and the other parts are not held up.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// The two routes, for `app.dashboard_routes(..)` or `app.api_routes(..)`.
    pub fn router(self) -> Router {
        let all = Arc::new(self);
        let one = all.clone();
        Router::new()
            .route(
                &all.path.clone(),
                get(move || {
                    let all = all.clone();
                    async move { read_all(&all.parts, all.timeout).await }
                }),
            )
            .route(
                &format!("{}/{{name}}", one.path),
                get(move |Path(name): Path<String>| {
                    let one = one.clone();
                    async move { read_one(&one.parts, &name, one.timeout).await }
                }),
            )
    }
}
