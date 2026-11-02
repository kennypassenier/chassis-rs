//! A project's own browser application (feat-webapp-1): a folder of HTML,
//! JavaScript and CSS served under one path, behind the kit's login.
//!
//! The kit's dashboard renders pages on the server (`dashboard_routes`,
//! `render_project`). Some projects want the other shape: static files that
//! talk to the service's JSON API from the browser — the homelab admin
//! dashboard is plain HTML with ES modules and kp-themes, no build step.
//! This serves such a folder:
//!
//! * from files compiled into the binary ([`WebApp::embedded`]) or read from
//!   a directory on each request ([`WebApp::dir`], for development);
//! * under a mount path (`/app` by default), where a path without a file
//!   extension that matches no file answers `index.html` so a client-side
//!   router owns the rest of the URL;
//! * with a strong `ETag` and `no-cache` so a changed file is picked up on
//!   the next load without a build step renaming it, and a year of
//!   `immutable` when the URL carries `?v=` (the kit's own convention);
//! * with its own `Content-Security-Policy`, the kit's by default: scripts,
//!   styles, fonts and connections from this origin only;
//! * behind the admin login, exactly like the kit's pages: a browser
//!   without a session is sent to `/login`, a script without the login
//!   token gets a 401.
//!
//! * with the kit's kp-themes runtime added to every HTML page
//!   (`/static/chassis/webapp-runtime.js`), unless [`WebApp::without_kit_runtime`].
//!
//! * installable on a phone or desktop (a manifest, icons and a service worker
//!   that never serves a stale page), unless [`WebApp::without_pwa`].
//!
//! The kit's own routes cannot be shadowed: a mount path that is `/` or
//! starts with one of them is refused at start and at `--check`.

mod files;
mod inject;
mod paths;
mod pwa;
mod router;
mod serving;
pub(crate) mod share_guard;
mod validate;

use std::path::PathBuf;

pub use pwa::{
    ClientMode, Dir, Display, FormFactor, Orientation, Pwa, Reload, Screenshot, ShareTarget,
    Shortcut,
};
pub use validate::single_installable;

/// The policy a web app gets unless it names its own: the kit's pages'
/// policy. `'unsafe-inline'` for styles covers `style=""` attributes that
/// kp-themes' components write; scripts stay `'self'` only.
pub const DEFAULT_CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

/// Paths the kit serves itself; a web app mounted on or under one of them
/// would hide it.
const RESERVED: &[&str] = &[
    "/status",
    "/readyz",
    "/login",
    "/logout",
    "/static",
    "/api",
    "/clients",
    "/passkeys",
    "/storage",
    "/healthz",
    "/metrics",
];

/// Where the files come from.
#[derive(Clone)]
enum Source {
    /// `(path relative to the app root, bytes)`, e.g. `("index.html",
    /// include_bytes!("../web/index.html"))`.
    Embedded(&'static [(&'static str, &'static [u8])]),
    /// A directory read on every request.
    Dir(PathBuf),
}

/// A static browser application served under one path behind the login.
/// Register it with [`crate::App::webapp`].
#[derive(Clone)]
pub struct WebApp {
    mount: String,
    source: Source,
    csp: String,
    /// Whether the file server adds the kit's runtime script to HTML pages.
    kit_runtime: bool,
    /// feat-webapp-4: the install settings; `None` after `without_pwa()`.
    pwa: Option<Pwa>,
}

impl WebApp {
    /// Files compiled into the binary. Paths are relative to the app root
    /// and use `/` (`"index.html"`, `"js/fleet.js"`); `index.html` must be
    /// one of them.
    pub fn embedded(files: &'static [(&'static str, &'static [u8])]) -> Self {
        WebApp {
            mount: String::new(),
            source: Source::Embedded(files),
            csp: DEFAULT_CSP.to_string(),
            kit_runtime: true,
            pwa: Some(Pwa::new()),
        }
    }

    /// Files read from `dir` on every request: edit, reload, no rebuild.
    /// Meant for development; a release embeds.
    pub fn dir(dir: impl Into<PathBuf>) -> Self {
        WebApp {
            mount: String::new(),
            source: Source::Dir(dir.into()),
            csp: DEFAULT_CSP.to_string(),
            kit_runtime: true,
            pwa: Some(Pwa::new()),
        }
    }

    /// Serve under `path` instead of the root (feat-pages-1: the root is
    /// the default since 3.1.0). It starts with `/` and does not start with
    /// one of the kit's own routes; `/` is the root.
    pub fn at(mut self, path: &str) -> Self {
        self.mount = path.trim_end_matches('/').to_string();
        self
    }

    /// Replace [`DEFAULT_CSP`] for this app's responses.
    pub fn csp(mut self, policy: &str) -> Self {
        self.csp = policy.to_string();
        self
    }

    /// Do not add the kit's runtime script (`/static/chassis/webapp-runtime.js`:
    /// kp-themes' effects and remembered choices) to the app's HTML pages.
    /// For an app that attaches kp-themes' runtime itself.
    pub fn without_kit_runtime(mut self) -> Self {
        self.kit_runtime = false;
        self
    }

    /// Change how the app installs (feat-webapp-4): its name, display mode
    /// and colours. Without this call the app is installable with the
    /// defaults, so this is only for what should differ.
    pub fn pwa(mut self, pwa: Pwa) -> Self {
        self.pwa = Some(pwa);
        self
    }

    /// Do not make the app installable: no manifest, no service worker, no
    /// tags in the pages.
    pub fn without_pwa(mut self) -> Self {
        self.pwa = None;
        self
    }

    /// The mount path, without a trailing slash; `/` for the root.
    pub fn mount(&self) -> &str {
        if self.mount.is_empty() {
            "/"
        } else {
            &self.mount
        }
    }

    /// Whether the app owns `/` and every path no route claims.
    pub fn at_root(&self) -> bool {
        self.mount.is_empty()
    }
}

#[cfg(test)]
mod pwa_extras_tests;
#[cfg(test)]
mod pwa_fields_tests;
#[cfg(test)]
mod pwa_hardening_tests;
#[cfg(test)]
mod pwa_mount_tests;
#[cfg(test)]
mod pwa_screenshots_tests;
#[cfg(test)]
mod pwa_tests;
#[cfg(test)]
mod runtime_tests;
#[cfg(test)]
mod share_guard_tests;
#[cfg(test)]
mod tests;
