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

use std::collections::BTreeMap;
use std::net::SocketAddr;
use std::path::Path;
use std::time::Duration;

use axum::Router;
use reqwest::Method;
use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderMap, HeaderValue, ORIGIN, REFERER};

use crate::app::{App, AppSpec, Running};
use crate::core::error::Error;
use crate::shell::time::random_hex;

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
    dir: tempfile::TempDir,
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
    /// Start `spec` with `router` as its public routes, exactly as
    /// `App::from_args_with_env` + `start()` would: a temporary state
    /// directory, a fresh login token and secret key, `127.0.0.1:0`.
    /// Panics with the kit's error when the app does not start.
    pub async fn start(spec: AppSpec, router: Router) -> TestApp {
        Self::start_with_env(spec, router, &[], |_| {}).await
    }

    /// [`TestApp::start`], with a closure that configures the [`App`]
    /// before it starts — where a project registers `api_routes`,
    /// `client_form_field`, `on_client_issued`, `nav_entry`, and so on.
    pub async fn start_with(
        spec: AppSpec,
        router: Router,
        configure: impl FnOnce(&mut App),
    ) -> TestApp {
        Self::start_with_env(spec, router, &[], configure).await
    }

    /// [`TestApp::start_with`], with extra environment entries laid over
    /// the harness's own (`<PREFIX>_STATE_DIR`, `_LISTEN`, `_LOG`,
    /// `_TOKEN`, `_SECRET_KEY`, `_PUBLIC_URL`): a project's own knobs, or
    /// a kit knob the test wants at another value. A key that is also one
    /// of the harness's wins over the harness.
    pub async fn start_with_env(
        spec: AppSpec,
        router: Router,
        env: &[(&str, &str)],
        configure: impl FnOnce(&mut App),
    ) -> TestApp {
        let name = spec.name;
        match Self::launch(spec, router, true, env, configure).await {
            Ok(app) => app,
            Err(e) => panic!(
                "the test app `{name}` did not start: {e}. What now: the message above is the kit's own; fix what it names, or use TestApp::try_start_open when the refusal is what the test asserts"
            ),
        }
    }

    /// Start a service that opted in to an OPEN dashboard
    /// (`AppSpec::open_dashboard`): no `<PREFIX>_TOKEN`, no
    /// `<PREFIX>_SECRET_KEY`, every caller is the admin. [`TestApp::token`]
    /// and [`TestApp::login`] have nothing to offer on such an app and say
    /// so. Panics when the app does not start.
    pub async fn start_open(
        spec: AppSpec,
        router: Router,
        configure: impl FnOnce(&mut App),
    ) -> TestApp {
        let name = spec.name;
        match Self::launch(spec, router, false, &[], configure).await {
            Ok(app) => app,
            Err(e) => panic!(
                "the open test app `{name}` did not start: {e}. What now: set AppSpec::open_dashboard on the spec, or start it with secrets through TestApp::start"
            ),
        }
    }

    /// [`TestApp::start_open`] that returns the kit's refusal instead of
    /// panicking — for the test that proves a service which did NOT opt in
    /// refuses to start without its secrets.
    pub async fn try_start_open(spec: AppSpec, router: Router) -> Result<TestApp, Error> {
        Self::launch(spec, router, false, &[], |_| {}).await
    }

    async fn launch(
        spec: AppSpec,
        router: Router,
        with_secrets: bool,
        extra_env: &[(&str, &str)],
        configure: impl FnOnce(&mut App),
    ) -> Result<TestApp, Error> {
        let dir = tempfile::tempdir().map_err(|e| {
            Error::internal(
                format!("could not create a temporary state directory for the test app: {e}"),
                "check that the system's temporary directory exists and is writable",
            )
        })?;
        let prefix = spec.prefix();
        let mut env: BTreeMap<String, String> = BTreeMap::new();
        env.insert(
            format!("{prefix}_STATE_DIR"),
            dir.path().display().to_string(),
        );
        // Port 0: the kernel picks a free port and `Running::addr` reports
        // it, so two suites never collide (K11).
        env.insert(format!("{prefix}_LISTEN"), "127.0.0.1:0".into());
        env.insert(format!("{prefix}_LOG"), "warn".into());
        // The passkeys feature wants the public address at start when it is
        // compiled in; no test request goes through it, so any address does.
        env.insert(
            format!("{prefix}_PUBLIC_URL"),
            format!("https://{}.example.lan", spec.name),
        );
        let token = if with_secrets {
            // The same shapes `gen-secret` prints: a long random token and a
            // 32-byte hex key, fresh per app so no test depends on a value.
            let token = random_hex(32)?;
            env.insert(format!("{prefix}_TOKEN"), token.clone());
            env.insert(format!("{prefix}_SECRET_KEY"), random_hex(32)?);
            Some(token)
        } else {
            None
        };
        for (key, value) in extra_env {
            env.insert((*key).to_string(), (*value).to_string());
        }
        let mut app =
            App::from_args_with_env(spec.clone(), vec![spec.name.to_string()], env, router)?;
        configure(&mut app);
        let running = app.start().await?;
        // Redirects stay visible: a login answers 303, a page behind the
        // login answers 303 to /login, and a test asserts on exactly that.
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| {
                Error::internal(
                    format!("could not build the test HTTP client: {e}"),
                    "this is a reqwest/TLS setup problem on the machine running the tests, not the app's",
                )
            })?;
        Ok(TestApp {
            addr: running.addr,
            dir,
            token,
            session: None,
            running: Some(running),
            client,
            timeout: DEFAULT_REQUEST_TIMEOUT,
        })
    }

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

    /// The temporary state directory the app writes its stores to. It is
    /// removed when the `TestApp` is dropped.
    pub fn state_dir(&self) -> &Path {
        self.dir.path()
    }

    /// The admin login token (`<PREFIX>_TOKEN`), for a test that logs in by
    /// hand or sends it as a bearer. Panics on an app from
    /// [`TestApp::start_open`], which has none.
    pub fn token(&self) -> &str {
        self.token.as_deref().unwrap_or_else(|| {
            panic!(
                "this app runs with an OPEN dashboard and has no login token. What now: start it with TestApp::start (which generates secrets) when the test needs to log in"
            )
        })
    }

    /// The admin session cookie (`name=value`) once [`TestApp::login`] ran,
    /// for a request the helpers do not build.
    pub fn session_cookie(&self) -> Option<&str> {
        self.session.as_deref()
    }

    /// Give every later request this long instead of
    /// [`DEFAULT_REQUEST_TIMEOUT`].
    pub fn set_request_timeout(&mut self, timeout: Duration) {
        self.timeout = timeout;
    }

    /// Log in as the admin with the login token and keep the session
    /// cookie, so [`TestApp::page`], [`TestApp::get_json`],
    /// [`TestApp::post_json`], [`TestApp::delete`] and
    /// [`TestApp::issue_client`] act as the logged-in admin from here on.
    /// Panics when the login does not answer 303 with a cookie.
    pub async fn login(&mut self) {
        let token = self.token().to_string();
        let response = self
            .client
            .post(self.url("/login"))
            .timeout(self.timeout)
            .form(&[("token", token.as_str())])
            .send()
            .await
            .unwrap_or_else(|e| panic!("POST /login did not answer: {e}"));
        let status = response.status().as_u16();
        let cookie = response
            .headers()
            .get(reqwest::header::SET_COOKIE)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(';').next())
            .map(str::to_string);
        match (status, cookie) {
            (303, Some(cookie)) => self.session = Some(cookie),
            (status, cookie) => {
                let body = response.text().await.unwrap_or_default();
                panic!(
                    "login as the admin failed: status {status}, cookie {cookie:?}, body: {body}. What now: the login route is the kit's; if the app registered a rate limit or a guard that refuses it, start the test with it relaxed"
                );
            }
        }
    }

    /// A request as the admin's browser or script: the session cookie is
    /// attached once [`TestApp::login`] ran, redirects are not followed,
    /// and the timeout applies. Finish it with reqwest's `.send().await`,
    /// or hand it to [`TestApp::send_json`] / [`TestApp::send_text`].
    pub fn request(&self, method: Method, path: &str) -> reqwest::RequestBuilder {
        let mut request = self
            .client
            .request(method, self.url(path))
            .timeout(self.timeout);
        if let Some(cookie) = &self.session {
            request = request.header(reqwest::header::COOKIE, cookie);
        }
        request
    }

    /// A request as a script or another service: `Authorization: Bearer
    /// <token>`, no cookie. `token` is what [`TestApp::issue_client`]
    /// returned, or [`TestApp::token`] for the admin's own bearer.
    pub fn bearer(&self, method: Method, path: &str, token: &str) -> reqwest::RequestBuilder {
        self.client
            .request(method, self.url(path))
            .timeout(self.timeout)
            .bearer_auth(token)
    }

    /// Fetch a page the way a browser would (`Accept: text/html`), as the
    /// admin when logged in: `(status, html)`.
    pub async fn page(&self, path: &str) -> (u16, String) {
        Self::send_text(
            self.request(Method::GET, path)
                .header(ACCEPT, "text/html,application/xhtml+xml"),
        )
        .await
    }

    /// One JSON call as the admin: `body` is sent as JSON when given;
    /// the answer is `(status, json)`, where an empty body reads as
    /// `Value::Null` and a body that is not JSON as `Value::String`.
    pub async fn json(
        &self,
        method: Method,
        path: &str,
        body: Option<serde_json::Value>,
    ) -> (u16, serde_json::Value) {
        let mut request = self.request(method, path);
        if let Some(body) = body {
            request = request.json(&body);
        }
        Self::send_json(request).await
    }

    /// `GET path` as the admin → `(status, json)`.
    pub async fn get_json(&self, path: &str) -> (u16, serde_json::Value) {
        self.json(Method::GET, path, None).await
    }

    /// `POST path` with a JSON body as the admin → `(status, json)`.
    pub async fn post_json(&self, path: &str, body: serde_json::Value) -> (u16, serde_json::Value) {
        self.json(Method::POST, path, Some(body)).await
    }

    /// `DELETE path` as the admin → `(status, json)`; a `204` reads as
    /// `(204, Value::Null)`.
    pub async fn delete(&self, path: &str) -> (u16, serde_json::Value) {
        self.json(Method::DELETE, path, None).await
    }

    /// Send any request built with [`TestApp::request`] or
    /// [`TestApp::bearer`] and read `(status, json)` the way
    /// [`TestApp::json`] does. Panics when no answer arrives at all.
    pub async fn send_json(request: reqwest::RequestBuilder) -> (u16, serde_json::Value) {
        let (status, text) = Self::send_text(request).await;
        let json = if text.trim().is_empty() {
            serde_json::Value::Null
        } else {
            serde_json::from_str(&text).unwrap_or(serde_json::Value::String(text))
        };
        (status, json)
    }

    /// Send any request and read `(status, body as text)`. Panics when no
    /// answer arrives at all (a dead server, a refused connection).
    pub async fn send_text(request: reqwest::RequestBuilder) -> (u16, String) {
        let response = request.send().await.unwrap_or_else(|e| {
            panic!(
                "the test app did not answer: {e}. What now: the app was stopped or never started; check the order of shutdown() and this request"
            )
        });
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        (status, text)
    }

    /// Issue a client through `POST /api/clients` as the admin — `fields`
    /// are the project's extra issue-form fields (K16), by name — and
    /// reveal its token the way the Clients page's Reveal button does.
    /// Panics unless the issue answers 201 and the reveal 200; call
    /// [`TestApp::login`] first.
    pub async fn issue_client(&self, name: &str, fields: &[(&str, &str)]) -> IssuedClient {
        if self.session.is_none() {
            panic!(
                "issue_client needs the admin session. What now: call `app.login().await` before issuing a client"
            );
        }
        let mut body = serde_json::Map::new();
        body.insert(
            "name".to_string(),
            serde_json::Value::String(name.to_string()),
        );
        for (key, value) in fields {
            body.insert(
                (*key).to_string(),
                serde_json::Value::String((*value).to_string()),
            );
        }
        let (status, view) = self
            .post_json("/api/clients", serde_json::Value::Object(body))
            .await;
        assert_eq!(
            status, 201,
            "issuing client `{name}` was refused: {view}. What now: the message is the kit's or the project's on_client_issued hook's; give the client a free name and the fields the hook expects"
        );
        let id = view["id"]
            .as_str()
            .unwrap_or_else(|| panic!("the issued client has no id: {view}"))
            .to_string();
        let (status, revealed) = self.get_json(&format!("/api/clients/{id}/token")).await;
        assert_eq!(
            status, 200,
            "revealing the token of client `{name}` ({id}) failed: {revealed}"
        );
        let token = revealed["token"]
            .as_str()
            .unwrap_or_else(|| panic!("the reveal carries no token: {revealed}"))
            .to_string();
        IssuedClient {
            id,
            name: name.to_string(),
            token,
        }
    }

    /// The headers Chrome sends on a same-origin form submit from a
    /// dashboard page: `Origin` and `Referer` on this app, `Sec-Fetch-Site:
    /// same-origin`, `Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest:
    /// document`, an `Accept` that asks for HTML, and the form
    /// content type. Lay them on a request with `.headers(app.as_browser())`
    /// and add the fields with `.form(&[...])`: the kit must accept it, and
    /// answer a refusal as a page, not JSON (CF-7).
    pub fn as_browser(&self) -> HeaderMap {
        browser_headers("same-origin", &self.base_url())
    }

    /// The same headers from a form on another site (`Sec-Fetch-Site:
    /// cross-site`, a foreign `Origin` and `Referer`): the kit's CSRF rule
    /// must refuse a state-changing request that carries them.
    pub fn as_cross_site_browser(&self) -> HeaderMap {
        browser_headers("cross-site", CROSS_SITE_ORIGIN)
    }

    /// Stop the server the way SIGTERM would: drain in-flight requests and
    /// run the flush hooks (the stores persist). A second call does
    /// nothing. The state directory stays until the `TestApp` is dropped,
    /// so a test can look at what the stop wrote.
    pub async fn shutdown(&mut self) {
        if let Some(running) = self.running.take() {
            running.stop().await;
        }
    }
}

impl Drop for TestApp {
    fn drop(&mut self) {
        // Dropping `Running` drops the stop sender, and the server task
        // treats a closed channel as the stop signal: it drains and ends on
        // its own, without the flush hooks. Nothing keeps the task alive
        // after that, and the `TempDir` field removes the state directory.
        // A test that needs the flushes calls `shutdown()` before this.
        drop(self.running.take());
    }
}

fn browser_headers(site: &'static str, origin: &str) -> HeaderMap {
    let value = |s: &str| {
        HeaderValue::from_str(s).unwrap_or_else(|e| panic!("header value `{s}` is not ASCII: {e}"))
    };
    let mut headers = HeaderMap::new();
    headers.insert(ORIGIN, value(origin));
    headers.insert(REFERER, value(&format!("{origin}/")));
    headers.insert("sec-fetch-site", HeaderValue::from_static(site));
    headers.insert("sec-fetch-mode", HeaderValue::from_static("navigate"));
    headers.insert("sec-fetch-dest", HeaderValue::from_static("document"));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("text/html,application/xhtml+xml"),
    );
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/x-www-form-urlencoded"),
    );
    headers
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

#[cfg(feature = "self-update")]
impl FakeReleaseServer {
    /// Serve `binary` as `asset` of release `version` of `repo`
    /// (`owner/name`), signed with the trusted comment `<repo> v<version>`
    /// the updater binds a manifest to (S1).
    pub async fn start(repo: &str, version: &str, binary: &[u8], asset: &str) -> FakeReleaseServer {
        Self::start_signed_as(version, binary, asset, &format!("{repo} v{version}")).await
    }

    /// [`FakeReleaseServer::start`] with an explicit trusted comment on the
    /// signature — for the test that a genuine signature over another
    /// version's or another repository's manifest is refused.
    pub async fn start_signed_as(
        version: &str,
        binary: &[u8],
        asset: &str,
        trusted_comment: &str,
    ) -> FakeReleaseServer {
        use std::sync::Arc;
        use std::sync::atomic::{AtomicUsize, Ordering};

        let dir = tempfile::tempdir().expect("a temporary directory for the fake release");
        let keypair =
            minisign::KeyPair::generate_unencrypted_keypair().expect("a throwaway minisign key");
        let manifest = format!("{}  {}\n", crate::shell::update::sha256_hex(binary), asset);
        let signature = minisign::sign(
            Some(&keypair.pk),
            &keypair.sk,
            manifest.as_bytes(),
            Some(trusted_comment),
            None,
        )
        .expect("signing the fake manifest");
        std::fs::write(dir.path().join("VERSION"), version).expect("write VERSION");
        std::fs::write(dir.path().join("SHA256SUMS"), &manifest).expect("write SHA256SUMS");
        std::fs::write(
            dir.path().join("SHA256SUMS.minisig"),
            signature.into_string(),
        )
        .expect("write SHA256SUMS.minisig");
        std::fs::write(dir.path().join(asset), binary).expect("write the asset");
        let root = dir.path().to_path_buf();
        let version_hits = Arc::new(AtomicUsize::new(0));
        let hits = version_hits.clone();
        let app = Router::new().route(
            "/{name}",
            axum::routing::get(
                move |axum::extract::Path(name): axum::extract::Path<String>| {
                    let root = root.clone();
                    let hits = hits.clone();
                    async move {
                        if name == "VERSION" {
                            hits.fetch_add(1, Ordering::SeqCst);
                        }
                        match std::fs::read(root.join(&name)) {
                            Ok(bytes) => (axum::http::StatusCode::OK, bytes),
                            Err(_) => (axum::http::StatusCode::NOT_FOUND, Vec::new()),
                        }
                    }
                },
            ),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind the fake release server on a free port");
        let addr = listener
            .local_addr()
            .expect("the fake release server's address");
        let task = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("the fake release server serves until the runtime ends");
        });
        FakeReleaseServer {
            url: format!("http://{addr}"),
            pubkey: keypair.pk.to_base64(),
            dir,
            version_hits,
            _task: task,
        }
    }
}
