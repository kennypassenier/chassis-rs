//! Starting the app under test: the temporary state directory, the
//! environment that stands in for a deployment (port 0, fresh secrets) and
//! the HTTP client that keeps redirects visible. Its own module because it
//! is the one place the app is built; the `start*` constructors sit here
//! beside the `launch` they all end in.

use std::collections::BTreeMap;
use std::path::PathBuf;

use axum::Router;

use super::{DEFAULT_REQUEST_TIMEOUT, TestApp};
use crate::app::{App, AppSpec};
use crate::core::error::Error;
use crate::shell::time::random_hex;

impl TestApp {
    /// Build the app from a fresh environment, let `configure` register
    /// hooks, start it and wrap it with a client.
    pub(super) async fn launch(
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
        let state_key = format!("{prefix}_STATE_DIR");
        let token_key = format!("{prefix}_TOKEN");
        let env = test_env(&spec, dir.path(), with_secrets, extra_env)?;
        // The token the app actually starts with: read AFTER the overlay, so
        // an `extra_env` entry that names `<PREFIX>_TOKEN` is what `token()`
        // and `login()` use (live-found by kyu on 1.8.0: the harness logged
        // in with the token it had generated, not the one it was given).
        let token = env.get(&token_key).cloned();
        let state_dir = env
            .get(&state_key)
            .map(PathBuf::from)
            .unwrap_or_else(|| dir.path().to_path_buf());
        let mut app =
            App::from_args_with_env(spec.clone(), vec![spec.name.to_string()], env, router)?;
        configure(&mut app);
        let running = app.start().await?;
        let client = test_client()?;
        Ok(TestApp {
            addr: running.addr,
            _dir: dir,
            state_dir,
            token,
            session: None,
            running: Some(running),
            client,
            timeout: DEFAULT_REQUEST_TIMEOUT,
        })
    }

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

    /// [`TestApp::start_with_env`] that returns the kit's refusal instead of
    /// panicking: the test that proves a bad configuration (a storage warn
    /// line above the budget, a data kind that does not match the schema)
    /// stops the start with the right message.
    pub async fn try_start_with_env(
        spec: AppSpec,
        router: Router,
        env: &[(&str, &str)],
        configure: impl FnOnce(&mut App),
    ) -> Result<TestApp, Error> {
        Self::launch(spec, router, true, env, configure).await
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
}

/// The environment of a test deployment: the state directory, port 0, a
/// quiet log, a public address and (unless the app runs open) fresh
/// secrets, with the caller's overrides on top.
fn test_env(
    spec: &AppSpec,
    dir: &std::path::Path,
    with_secrets: bool,
    extra_env: &[(&str, &str)],
) -> Result<BTreeMap<String, String>, Error> {
    let prefix = spec.prefix();
    let mut env: BTreeMap<String, String> = BTreeMap::new();
    env.insert(format!("{prefix}_STATE_DIR"), dir.display().to_string());
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
    if with_secrets {
        // The same shapes `gen-secret` prints: a long random token and a
        // 32-byte hex key, fresh per app so no test depends on a value.
        env.insert(format!("{prefix}_TOKEN"), random_hex(32)?);
        env.insert(format!("{prefix}_SECRET_KEY"), random_hex(32)?);
    }
    for (key, value) in extra_env {
        env.insert((*key).to_string(), (*value).to_string());
    }
    Ok(env)
}

/// Redirects stay visible: a login answers 303, a page behind the login
/// answers 303 to /login, and a test asserts on exactly that.
fn test_client() -> Result<reqwest::Client, Error> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| {
            Error::internal(
                format!("could not build the test HTTP client: {e}"),
                "this is a reqwest/TLS setup problem on the machine running the tests, not the app's",
            )
        })
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
