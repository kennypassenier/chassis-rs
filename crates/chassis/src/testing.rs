//! Test helpers for a service built on the kit (K25): start the app
//! in-process on a free port with fresh secrets and a temporary state
//! directory, log in as the admin, issue a client, call a route with its
//! token, fetch a page. Three projects (kyu, Almanac, the inbox example)
//! wrote those same six steps by hand around the same kit on 2026-09-06,
//! and the kit's own suites did it over raw TCP; this module is the one
//! copy.
//!
//! Enabled by the `testing` feature, which implies `dashboard`. A project
//! lists it in its dev-dependencies:
//!
//! ```toml
//! [dev-dependencies]
//! chassis = { path = "../chassis-rs/crates/chassis", features = ["testing"] }
//! ```
//!
//! Nothing here is a builder (K24): [`TestApp::start`] takes what
//! [`App`] takes, [`TestApp::start_with`] adds a closure that registers
//! hooks before the app starts, and every request helper answers with a
//! status and a body. A helper that cannot do its job panics with a
//! remedy, so a test fails at the step that broke rather than three
//! assertions later.
//!
//! With `self-update` also enabled, [`FakeReleaseServer`] serves a signed
//! release from a temporary directory, the way the kit's own update tests
//! use it.

mod browser;
mod launch;
#[cfg(feature = "self-update")]
mod release_server;
mod requests;
mod session;

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::app::Running;

/// How long one request from a helper may take before the test fails with
/// a timeout instead of hanging the whole suite. Change it per app with
/// [`TestApp::set_request_timeout`].
pub const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// The `Origin` a cross-site browser request claims to come from in
/// [`TestApp::as_cross_site_browser`]: any host that is not the app's own.
pub const CROSS_SITE_ORIGIN: &str = "https://evil.example";

/// A service started in-process for a test: its own temporary state
/// directory, fresh secrets, port 0, and an HTTP client that remembers
/// the admin session once [`TestApp::login`] ran.
///
/// Dropping it stops the server (the stop signal is the dropped handle)
/// and removes the state directory; call [`TestApp::shutdown`] first when
/// the test needs the drain and the flush hooks to have run — a test about
/// what is on disk after a stop, for instance.
pub struct TestApp {
    addr: SocketAddr,
    /// The harness's own temporary directory, held only so it is removed
    /// on drop.
    _dir: tempfile::TempDir,
    /// The state directory the app actually runs with: the harness's own,
    /// unless `extra_env` named another `<PREFIX>_STATE_DIR`.
    state_dir: PathBuf,
    /// `None` for an app started with [`TestApp::start_open`]: an open
    /// dashboard has no login token.
    token: Option<String>,
    /// The admin session cookie as `name=value`, after [`TestApp::login`].
    session: Option<String>,
    running: Option<Running>,
    client: reqwest::Client,
    timeout: Duration,
}

/// What [`TestApp::issue_client`] hands back: the client's id (for the
/// `/api/clients/{id}/…` routes) and the token a script would send as
/// `Authorization: Bearer`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IssuedClient {
    pub id: String,
    pub name: String,
    pub token: String,
}

impl TestApp {
    /// The address the app listens on (`127.0.0.1:<the port the kernel picked>`).
    pub fn addr(&self) -> SocketAddr {
        self.addr
    }

    /// `http://127.0.0.1:<port>`, without a trailing slash.
    pub fn base_url(&self) -> String {
        format!("http://{}", self.addr)
    }

    /// `base_url()` + `path`; `path` starts with `/`.
    pub fn url(&self, path: &str) -> String {
        format!("{}{path}", self.base_url())
    }

    /// The state directory the app writes its stores to: the harness's
    /// temporary directory (removed when the `TestApp` is dropped), or the
    /// `<PREFIX>_STATE_DIR` an `extra_env` entry named instead (which the
    /// test then owns).
    pub fn state_dir(&self) -> &Path {
        &self.state_dir
    }

    /// Give every later request this long instead of
    /// [`DEFAULT_REQUEST_TIMEOUT`].
    pub fn set_request_timeout(&mut self, timeout: Duration) {
        self.timeout = timeout;
    }
}

/// A signed fake release served in-process (K25, with `self-update`): a
/// temporary directory with `VERSION`, `SHA256SUMS`, `SHA256SUMS.minisig`
/// signed by a throwaway minisign key, and the asset itself, behind an
/// axum server on port 0. Point the updater at [`FakeReleaseServer::url`]
/// with [`FakeReleaseServer::pubkey`] as its trust root and
/// `update_allow_insecure` on (the server speaks plain http).
#[cfg(feature = "self-update")]
pub struct FakeReleaseServer {
    /// `http://127.0.0.1:<port>`, what `<PREFIX>_UPDATE_URL` points at.
    pub url: String,
    /// The throwaway public key, base64, for `update_pubkey`.
    pub pubkey: String,
    /// The served files; a test may rewrite them to fake a tampered host.
    pub dir: tempfile::TempDir,
    /// How many times `GET /VERSION` was answered: the update loop's tick
    /// schedule is read from it.
    pub version_hits: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    _task: tokio::task::JoinHandle<()>,
}
