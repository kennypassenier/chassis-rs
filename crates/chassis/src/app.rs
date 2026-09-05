//! The one type a service talks to (AR2): describe yourself, hand over
//! your routes and hooks, run.
//!
//! ```text
//! let spec = chassis::AppSpec { name: "inbox", version: env!("CARGO_PKG_VERSION"), ..Default::default() };
//! let mut app = chassis::App::from_env_and_args(spec, public_routes)?;
//! app.api_routes(token_protected_routes);   // behind Authorization: Bearer <client token>
//! app.dashboard_routes(admin_pages);        // behind the login session
//! app.test_route("POST", "/v1/messages", "application/json", "{\"hello\":\"world\"}");
//! app.on_check(|| my_store.verify());       // runs under --check, never writes
//! app.on_flush(|| my_store.checkpoint());   // runs after the server drained
//! app.subsystem(my_store_health);           // shows up in /healthz
//! app.metrics_source(my_scraper);           // appended verbatim to /metrics
//! app.exempt_from_timeout("/t/");           // long polls live here
//! app.run().await                            // ExitCode
//! ```
//!
//! `run` does everything AR15 lists: answer the control commands
//! (`--version`, `--check`, `--print-config`, `--healthcheck`,
//! `gen-secret`) without opening a listening socket, start logging, bind,
//! tell systemd we are ready, serve, and stop cleanly on SIGTERM. Control
//! commands are dispatched in `run`, not in `from_args`, so a project's
//! hooks are registered by the time `--check` runs (the critic's
//! objection #8). `--version` is the exception: it is answered before
//! configuration is even read (AR20).

use std::collections::{BTreeMap, HashSet};
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::routing::get;
use clap::{Arg, ArgAction, Command};
use tokio::net::TcpListener;
use tokio::sync::{Semaphore, oneshot};

use crate::core::config::{Knob, render_table};
use crate::core::error::Error;
use crate::shell::config_load::{Loaded, load};
use crate::shell::guards::{Guards, parse_trusted_proxies};
use crate::shell::health::{self, Health, Subsystem};
use crate::shell::http::{AccessState, with_kit_layers};
use crate::shell::lifecycle;
use crate::shell::logging::{self, LogFormat};
use crate::shell::metrics::{Metrics, ScrapeSource, metrics_handler};
#[cfg(feature = "dashboard")]
use crate::shell::store::ClientStore;

/// What a service says about itself. Everything else is configuration.
#[derive(Debug, Clone)]
pub struct AppSpec {
    /// The service's name: binary name, env prefix (upper-cased), cookie
    /// and metric prefix, default state directory `/var/lib/<name>`.
    pub name: &'static str,
    /// The service's own version, shown by `--version` and `/healthz`.
    pub version: &'static str,
    /// Where state lives when nobody says otherwise (AR3, rule 28).
    pub default_state_dir: Option<PathBuf>,
    /// Where to listen when nobody says otherwise (K11).
    pub default_listen: &'static str,
}

impl Default for AppSpec {
    fn default() -> Self {
        Self {
            name: "service",
            version: "0.0.0",
            default_state_dir: None,
            default_listen: "0.0.0.0:8080",
        }
    }
}

impl AppSpec {
    /// `INBOX` for `inbox`; dashes become underscores.
    pub fn prefix(&self) -> String {
        self.name.to_ascii_uppercase().replace('-', "_")
    }

    /// `inbox` for `inbox`; dashes become underscores (Prometheus names).
    pub fn metric_prefix(&self) -> String {
        self.name.to_ascii_lowercase().replace('-', "_")
    }

    fn state_dir_default(&self) -> PathBuf {
        self.default_state_dir
            .clone()
            .unwrap_or_else(|| PathBuf::from("/var/lib").join(self.name))
    }

    /// The kit's own knobs (AR3). Milestones add rows here; a doc test
    /// compares this list with the AR3 table.
    pub fn knobs(&self) -> Vec<Knob> {
        let k = |key: &'static str, default: Option<&'static str>| Knob {
            key,
            default,
            secret: false,
        };
        let secret = |key: &'static str| Knob {
            key,
            default: None,
            secret: true,
        };
        vec![
            k("listen", Some(self.default_listen)),
            k("state_dir", None),
            k("config", None),
            k("log", Some("info")),
            k("log_format", Some("text")),
            k("shutdown_timeout_ms", Some("10000")),
            // L2 — guards, health, metrics (K6, K7, K10)
            k("max_body_bytes", Some("1048576")),
            k("max_in_flight", Some("64")),
            k("retry_after_secs", Some("5")),
            k("request_timeout_secs", Some("30")),
            k("rate_limit_login_per_min", Some("10")),
            k("rate_limit_login_burst", Some("5")),
            k("rate_limit_token_per_sec", Some("50")),
            k("rate_limit_token_burst", Some("100")),
            k("subsystem_check_timeout_ms", Some("2000")),
            k("healthcheck_timeout_secs", Some("5")),
            k("trusted_proxies", Some("")),
            // L3 — login, clients, captures (K8, K12, K13)
            secret("token"),
            secret("secret_key"),
            k("session_ttl_secs", Some("86400")),
            k("remember_me_days", Some("30")),
            k("capture_keep", Some("20")),
            k("capture_body_bytes", Some("4096")),
            k("capture_ttl_secs", Some("3600")),
            k("capture_redact", Some("")),
            k("clients_persist_secs", Some("30")),
        ]
    }
}

/// A control command the command line asked for; answered by `run`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Control {
    Version,
    Check,
    PrintConfig,
    /// Probe a running instance's `/healthz` (K7). `None` = derive the URL
    /// from the configured listen address.
    Healthcheck(Option<String>),
    /// Print a fresh login token and secret key (K8, critic #12).
    GenSecret,
}

type Hook = Box<dyn FnOnce() -> Result<(), Error> + Send>;

/// The numbers the guards and stores run with, parsed once from the knobs.
#[derive(Debug, Clone)]
pub struct Limits {
    pub max_body_bytes: usize,
    pub max_in_flight: usize,
    pub retry_after: Duration,
    pub request_timeout: Duration,
    pub login_per_min: u32,
    pub login_burst: u32,
    pub token_per_sec: u32,
    pub token_burst: u32,
    pub subsystem_check_timeout: Duration,
    pub healthcheck_timeout: Duration,
    pub trusted_proxies: Vec<IpAddr>,
    pub session_ttl_secs: u64,
    pub remember_me_secs: u64,
    pub capture_keep: usize,
    pub capture_body_bytes: usize,
    pub capture_ttl: Duration,
    pub capture_redact: Vec<String>,
    pub clients_persist: Duration,
}

/// A configured, not yet started service.
pub struct App {
    pub spec: AppSpec,
    /// `None` only for `--version` and `gen-secret`, which never read configuration.
    pub loaded: Option<Loaded>,
    pub listen: SocketAddr,
    pub shutdown_timeout: Duration,
    pub limits: Limits,
    pub control: Option<Control>,
    router: Router,
    api_router: Router,
    dashboard_router: Router,
    checks: Vec<Hook>,
    flush: Option<Box<dyn FnOnce() + Send>>,
    subsystems: Vec<Arc<dyn Subsystem>>,
    scrape_sources: Vec<Arc<dyn ScrapeSource>>,
    timeout_exempt: HashSet<String>,
    #[cfg(feature = "dashboard")]
    test_route: Option<crate::shell::clients_api::TestRoute>,
    #[cfg(feature = "dashboard")]
    client_store: Option<Arc<dyn ClientStore>>,
}

/// A started service: its address and the handle to stop it.
pub struct Running {
    pub addr: SocketAddr,
    stop: oneshot::Sender<()>,
    task: tokio::task::JoinHandle<()>,
    shutdown_timeout: Duration,
    flushes: Vec<Box<dyn FnOnce() + Send>>,
}

fn parse_u64(loaded: &Loaded, key: &str, min: u64) -> Result<u64, Error> {
    let raw = loaded.get(key).unwrap_or("");
    let v: u64 = raw.trim().parse().map_err(|_| {
        Error::config(
            format!("knob `{key}` = `{raw}` is not a whole number"),
            format!("set {key} to an integer of at least {min}"),
        )
    })?;
    if v < min {
        return Err(Error::config(
            format!("knob `{key}` = {v} is below the minimum {min}"),
            format!("set {key} to at least {min}"),
        ));
    }
    Ok(v)
}

impl App {
    /// The whole lifecycle for a `main` that registers no hooks.
    pub async fn main(spec: AppSpec, router: Router) -> ExitCode {
        match App::from_env_and_args(spec, router) {
            Ok(app) => app.run().await,
            Err(e) => {
                eprintln!("{e}");
                ExitCode::FAILURE
            }
        }
    }

    /// `from_args` on the real command line.
    pub fn from_env_and_args(spec: AppSpec, router: Router) -> Result<App, Error> {
        App::from_args(spec, std::env::args().collect(), router)
    }

    fn bare(spec: AppSpec, router: Router, control: Control) -> App {
        App {
            spec,
            loaded: None,
            listen: "0.0.0.0:0".parse().expect("literal"),
            shutdown_timeout: Duration::from_secs(1),
            limits: Limits::placeholder(),
            control: Some(control),
            router,
            api_router: Router::new(),
            dashboard_router: Router::new(),
            checks: Vec::new(),
            flush: None,
            subsystems: Vec::new(),
            scrape_sources: Vec::new(),
            timeout_exempt: HashSet::new(),
            #[cfg(feature = "dashboard")]
            test_route: None,
            #[cfg(feature = "dashboard")]
            client_store: None,
        }
    }

    /// Parse `args` (argv[0] included) and load configuration. Nothing
    /// here opens a socket or touches the state directory.
    pub fn from_args(spec: AppSpec, args: Vec<String>, router: Router) -> Result<App, Error> {
        let knobs = spec.knobs();
        let mut cmd = Command::new(spec.name.to_string())
            .version(spec.version)
            .disable_version_flag(true)
            .subcommand(
                Command::new("gen-secret")
                    .about("Print a fresh login token and secret key for the environment file (terminal only)"),
            )
            .arg(
                Arg::new("version")
                    .long("version")
                    .short('V')
                    .action(ArgAction::SetTrue)
                    .help("Print the version of this binary and exit (reads nothing else)"),
            )
            .arg(
                Arg::new("check")
                    .long("check")
                    .action(ArgAction::SetTrue)
                    .help("Validate configuration and the project's own checks, exit 0/1, open no socket"),
            )
            .arg(
                Arg::new("print-config")
                    .long("print-config")
                    .action(ArgAction::SetTrue)
                    .help("Print every knob with its effective value and source; secrets masked"),
            )
            .arg(
                Arg::new("healthcheck")
                    .long("healthcheck")
                    .value_name("URL")
                    .num_args(0..=1)
                    .default_missing_value("")
                    .help("Probe /healthz of the running instance (URL optional; derived from listen) and exit 0 when it answers"),
            );
        for k in &knobs {
            cmd = cmd.arg(
                Arg::new(k.key)
                    .long(k.flag_name().trim_start_matches("--").to_string())
                    .value_name("VALUE")
                    .action(ArgAction::Set)
                    .help(format!(
                        "Overrides {} and the `{}` key in the config file",
                        k.env_name(&spec.prefix()),
                        k.key
                    )),
            );
        }
        let matches = cmd.try_get_matches_from(args).map_err(|e| {
            Error::invalid(
                e.to_string().trim_end().to_string(),
                "run with --help for the flags this service accepts",
            )
        })?;

        if matches.get_flag("version") {
            return Ok(App::bare(spec, router, Control::Version));
        }
        if matches.subcommand_matches("gen-secret").is_some() {
            return Ok(App::bare(spec, router, Control::GenSecret));
        }

        let mut flags = BTreeMap::new();
        for k in &knobs {
            if let Some(v) = matches.get_one::<String>(k.key) {
                flags.insert(k.key.to_string(), v.clone());
            }
        }
        let loaded = load(&spec.prefix(), &knobs, flags, &spec.state_dir_default())?;

        let control = if matches.get_flag("print-config") {
            Some(Control::PrintConfig)
        } else if matches.get_flag("check") {
            Some(Control::Check)
        } else {
            matches
                .get_one::<String>("healthcheck")
                .map(|u| Control::Healthcheck(if u.is_empty() { None } else { Some(u.clone()) }))
        };

        let listen_raw = loaded.get("listen").unwrap_or(spec.default_listen);
        let listen: SocketAddr = listen_raw.parse().map_err(|_| {
            Error::config(
                format!("listen address `{listen_raw}` is not host:port"),
                format!(
                    "set {}_LISTEN (or --listen) to something like 0.0.0.0:8080",
                    spec.prefix()
                ),
            )
        })?;
        let shutdown_timeout = lifecycle::parse_shutdown_timeout(
            loaded.get("shutdown_timeout_ms").unwrap_or("10000"),
        )?;
        // Validated here so --check catches a bad value; the subscriber is
        // installed in start() so control commands stay silent on stderr.
        LogFormat::parse(loaded.get("log_format").unwrap_or("text"))?;
        let limits = Limits {
            max_body_bytes: parse_u64(&loaded, "max_body_bytes", 1)? as usize,
            max_in_flight: parse_u64(&loaded, "max_in_flight", 1)? as usize,
            retry_after: Duration::from_secs(parse_u64(&loaded, "retry_after_secs", 1)?),
            request_timeout: Duration::from_secs(parse_u64(&loaded, "request_timeout_secs", 1)?),
            login_per_min: parse_u64(&loaded, "rate_limit_login_per_min", 1)? as u32,
            login_burst: parse_u64(&loaded, "rate_limit_login_burst", 1)? as u32,
            token_per_sec: parse_u64(&loaded, "rate_limit_token_per_sec", 1)? as u32,
            token_burst: parse_u64(&loaded, "rate_limit_token_burst", 1)? as u32,
            subsystem_check_timeout: Duration::from_millis(parse_u64(
                &loaded,
                "subsystem_check_timeout_ms",
                1,
            )?),
            healthcheck_timeout: Duration::from_secs(parse_u64(
                &loaded,
                "healthcheck_timeout_secs",
                1,
            )?),
            trusted_proxies: parse_trusted_proxies(loaded.get("trusted_proxies").unwrap_or(""))?,
            session_ttl_secs: parse_u64(&loaded, "session_ttl_secs", 60)?,
            remember_me_secs: parse_u64(&loaded, "remember_me_days", 1)? * 86_400,
            capture_keep: parse_u64(&loaded, "capture_keep", 1)? as usize,
            capture_body_bytes: parse_u64(&loaded, "capture_body_bytes", 1)? as usize,
            capture_ttl: Duration::from_secs(parse_u64(&loaded, "capture_ttl_secs", 1)?),
            capture_redact: loaded
                .get("capture_redact")
                .unwrap_or("")
                .split(',')
                .map(|s| s.trim().to_ascii_lowercase())
                .filter(|s| !s.is_empty())
                .collect(),
            clients_persist: Duration::from_secs(parse_u64(&loaded, "clients_persist_secs", 1)?),
        };

        // The dashboard's two secrets are validated at parse time so that
        // --check refuses a half-configured service (W6 = Don't do).
        #[cfg(feature = "dashboard")]
        crate::shell::auth::Secrets::parse(
            &spec.prefix(),
            loaded.get("token"),
            loaded.get("secret_key"),
        )?;

        Ok(App {
            spec,
            loaded: Some(loaded),
            listen,
            shutdown_timeout,
            limits,
            control,
            router,
            api_router: Router::new(),
            dashboard_router: Router::new(),
            checks: Vec::new(),
            flush: None,
            subsystems: Vec::new(),
            scrape_sources: Vec::new(),
            timeout_exempt: HashSet::new(),
            #[cfg(feature = "dashboard")]
            test_route: None,
            #[cfg(feature = "dashboard")]
            client_store: None,
        })
    }

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

    /// Replace the kit's encrypted-file client store (kyu keeps its
    /// SQLite table this way, AR5).
    #[cfg(feature = "dashboard")]
    pub fn client_store(&mut self, store: Arc<dyn ClientStore>) -> &mut Self {
        self.client_store = Some(store);
        self
    }

    /// A project check that `--check` (and the self-update's staged probe)
    /// runs after the kit's own validation. It must not write: the probe
    /// runs against the live store while the old version still serves.
    pub fn on_check(
        &mut self,
        f: impl FnOnce() -> Result<(), Error> + Send + 'static,
    ) -> &mut Self {
        self.checks.push(Box::new(f));
        self
    }

    /// Something to run after the server drained and before exit (K5):
    /// checkpoint a database, flush a journal.
    pub fn on_flush(&mut self, f: impl FnOnce() + Send + 'static) -> &mut Self {
        self.flush = Some(Box::new(f));
        self
    }

    /// A part of the service whose health shows in `/healthz` (K6).
    pub fn subsystem(&mut self, s: impl Subsystem + 'static) -> &mut Self {
        self.subsystems.push(Arc::new(s));
        self
    }

    /// Prometheus text the project computes at scrape time, appended to
    /// `/metrics` verbatim (K7; how kyu keeps its dynamic label sets).
    pub fn metrics_source(&mut self, s: impl ScrapeSource + 'static) -> &mut Self {
        self.scrape_sources.push(Arc::new(s));
        self
    }

    /// Paths under this prefix are not subject to the request timeout
    /// (long polls, streaming).
    pub fn exempt_from_timeout(&mut self, path_prefix: impl Into<String>) -> &mut Self {
        self.timeout_exempt.insert(path_prefix.into());
        self
    }

    /// With the dashboard compiled in, both secrets must be present; a
    /// half-configured or unconfigured login never starts (W6 = Don't do).
    #[cfg(feature = "dashboard")]
    fn require_dashboard_secrets(&self) -> Result<(), Error> {
        let loaded = self.loaded.as_ref().expect("loaded");
        let prefix = self.spec.prefix();
        match crate::shell::auth::Secrets::parse(
            &prefix,
            loaded.get("token"),
            loaded.get("secret_key"),
        )? {
            Some(_) => Ok(()),
            None => Err(Error::config(
                format!(
                    "the dashboard is compiled in but {prefix}_TOKEN and {prefix}_SECRET_KEY are not set"
                ),
                format!(
                    "run `{} gen-secret` on a terminal and put both lines in the environment file; a dashboard never starts without a login",
                    self.spec.name
                ),
            )),
        }
    }

    /// The URL `--healthcheck` probes when none is given: the configured
    /// port on the loopback address (an unspecified bind cannot be dialled).
    pub fn healthcheck_url(&self) -> String {
        let host = if self.listen.ip().is_unspecified() {
            "127.0.0.1".to_string()
        } else {
            self.listen.ip().to_string()
        };
        format!("http://{}:{}/healthz", host, self.listen.port())
    }

    /// Answer the control command, if any. `Some(code)` means "exit now".
    pub async fn control(&mut self) -> Result<Option<ExitCode>, Error> {
        match self.control.clone() {
            None => Ok(None),
            Some(Control::Version) => {
                println!("{} {}", self.spec.name, self.spec.version);
                Ok(Some(ExitCode::SUCCESS))
            }
            Some(Control::GenSecret) => {
                if !std::io::IsTerminal::is_terminal(&std::io::stdout()) {
                    return Err(Error::invalid(
                        "gen-secret prints secrets and stdout is not a terminal",
                        "run it in a terminal and paste the two lines into the environment file; never pipe it into a log",
                    ));
                }
                let prefix = self.spec.prefix();
                println!("{prefix}_TOKEN={}", crate::shell::time::random_hex(24)?);
                println!(
                    "{prefix}_SECRET_KEY={}",
                    crate::shell::time::random_hex(32)?
                );
                Ok(Some(ExitCode::SUCCESS))
            }
            Some(Control::PrintConfig) => {
                let loaded = self.loaded.as_ref().expect("loaded for print-config");
                print!("{}", render_table(&loaded.resolved));
                Ok(Some(ExitCode::SUCCESS))
            }
            Some(Control::Check) => {
                #[cfg(feature = "dashboard")]
                self.require_dashboard_secrets()?;
                for check in self.checks.drain(..) {
                    check()?;
                }
                println!("{}: configuration ok", self.spec.name);
                Ok(Some(ExitCode::SUCCESS))
            }
            Some(Control::Healthcheck(url)) => {
                let url = url.unwrap_or_else(|| self.healthcheck_url());
                let probe = health::probe(&url, self.limits.healthcheck_timeout).await?;
                println!(
                    "{}: alive={} status={} version={}",
                    self.spec.name, probe.alive, probe.status, probe.version
                );
                Ok(Some(if probe.alive {
                    ExitCode::SUCCESS
                } else {
                    ExitCode::FAILURE
                }))
            }
        }
    }

    /// Control command or full lifecycle; errors are printed with their
    /// remedy and turn into exit 1.
    pub async fn run(mut self) -> ExitCode {
        match self.control().await {
            Ok(Some(code)) => return code,
            Ok(None) => {}
            Err(e) => {
                eprintln!("{e}");
                return ExitCode::FAILURE;
            }
        }
        match self.start().await {
            Ok(running) => {
                lifecycle::wait_for_stop_signal().await;
                running.stop().await;
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("{e}");
                ExitCode::FAILURE
            }
        }
    }

    /// Install logging and metrics, bind, announce readiness, serve.
    pub async fn start(self) -> Result<Running, Error> {
        let loaded = self.loaded.as_ref().ok_or_else(|| {
            Error::internal(
                "start() called on a control-command app",
                "call run() instead",
            )
        })?;
        let filter = loaded.get("log").unwrap_or("info").to_string();
        let format = LogFormat::parse(loaded.get("log_format").unwrap_or("text"))?;
        logging::init(&filter, format)?;

        let metrics = Metrics::install(
            &self.spec.metric_prefix(),
            self.spec.version,
            self.scrape_sources.clone(),
        )?;
        let health = Health::new(
            self.spec.version,
            self.limits.subsystem_check_timeout,
            self.subsystems.clone(),
        );
        let guards = Guards {
            max_in_flight: Arc::new(Semaphore::new(self.limits.max_in_flight)),
            retry_after: self.limits.retry_after,
            request_timeout: self.limits.request_timeout,
            timeout_exempt: Arc::new(self.timeout_exempt.clone()),
            trusted_proxies: Arc::new(self.limits.trusted_proxies.clone()),
        };
        let access = AccessState {
            requests_total: metrics.requests_total(),
        };

        let listener = TcpListener::bind(self.listen).await.map_err(|e| {
            Error::config(
                format!("cannot listen on {}: {e}", self.listen),
                format!(
                    "free the port or set {}_LISTEN to another address",
                    self.spec.prefix()
                ),
            )
        })?;
        let addr = listener
            .local_addr()
            .map_err(|e| Error::internal(format!("local_addr: {e}"), "report this"))?;
        tracing::info!(name = self.spec.name, version = self.spec.version, %addr, "listening");

        let mut flushes: Vec<Box<dyn FnOnce() + Send>> = Vec::new();
        let kit_routes = Router::new()
            .route("/healthz", get(health::healthz).with_state(health))
            .route("/metrics", get(metrics_handler).with_state(metrics));

        #[allow(unused_mut)]
        let mut router = self.router.merge(kit_routes);

        #[cfg(feature = "dashboard")]
        {
            let (protected, flush) = crate::app_dashboard::mount(
                &self.spec,
                loaded,
                &self.limits,
                guards.clone(),
                addr,
                self.api_router,
                self.dashboard_router,
                self.test_route.clone(),
                self.client_store.clone(),
            )
            .await?;
            router = router.merge(protected);
            flushes.push(flush);
        }
        #[cfg(not(feature = "dashboard"))]
        {
            router = router.merge(self.api_router).merge(self.dashboard_router);
        }

        if let Some(f) = self.flush {
            flushes.push(f);
        }
        let router = with_kit_layers(router, guards, access, self.limits.max_body_bytes);

        let (stop_tx, stop_rx) = oneshot::channel::<()>();
        let task = tokio::spawn(async move {
            let serve = axum::serve(
                listener,
                router.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .with_graceful_shutdown(async {
                let _ = stop_rx.await;
            });
            if let Err(e) = serve.await {
                tracing::error!(error = %e, "server stopped with an error");
            }
        });
        lifecycle::notify_ready();
        Ok(Running {
            addr,
            stop: stop_tx,
            task,
            shutdown_timeout: self.shutdown_timeout,
            flushes,
        })
    }
}

impl Limits {
    /// Only for the control-command paths that never use them.
    fn placeholder() -> Self {
        Limits {
            max_body_bytes: 1,
            max_in_flight: 1,
            retry_after: Duration::from_secs(1),
            request_timeout: Duration::from_secs(1),
            login_per_min: 1,
            login_burst: 1,
            token_per_sec: 1,
            token_burst: 1,
            subsystem_check_timeout: Duration::from_secs(1),
            healthcheck_timeout: Duration::from_secs(1),
            trusted_proxies: Vec::new(),
            session_ttl_secs: 60,
            remember_me_secs: 60,
            capture_keep: 1,
            capture_body_bytes: 1,
            capture_ttl: Duration::from_secs(1),
            capture_redact: Vec::new(),
            clients_persist: Duration::from_secs(1),
        }
    }
}

impl Running {
    /// Drain in-flight requests and run the flush hooks (the kit's, then
    /// the project's), each bounded by the shutdown timeout. Always
    /// returns; the caller exits 0 (N1).
    pub async fn stop(self) {
        let Running {
            stop,
            task,
            shutdown_timeout,
            flushes,
            ..
        } = self;
        let _ = stop.send(());
        let drained = lifecycle::bounded(shutdown_timeout, "in-flight requests", async {
            let _ = task.await;
        })
        .await;
        for f in flushes {
            let done = tokio::task::spawn_blocking(f);
            lifecycle::bounded(shutdown_timeout, "a flush hook", async {
                let _ = done.await;
            })
            .await;
        }
        tracing::info!(drained, "stopped");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shell::health::SubsystemStatus;
    use axum::routing::get;

    fn spec() -> AppSpec {
        AppSpec {
            name: "t-app",
            version: "9.8.7",
            ..Default::default()
        }
    }

    fn argv(rest: &[&str]) -> Vec<String> {
        std::iter::once("t-app".to_string())
            .chain(rest.iter().map(|s| s.to_string()))
            .collect()
    }

    fn base_args(dir: &std::path::Path) -> Vec<&'static str> {
        let leaked: &'static str = Box::leak(dir.display().to_string().into_boxed_str());
        vec![
            "--state-dir",
            leaked,
            "--listen",
            "127.0.0.1:0",
            "--shutdown-timeout-ms",
            "2000",
        ]
    }

    #[tokio::test]
    async fn version_flag_reads_no_configuration() {
        // A state_dir pointing nowhere and a broken listen value: --version must not care (AR20).
        let mut app = App::from_args(
            spec(),
            argv(&[
                "--version",
                "--state-dir",
                "/nonexistent/x",
                "--listen",
                "garbage",
            ]),
            Router::new(),
        )
        .unwrap();
        assert!(app.loaded.is_none());
        assert_eq!(app.control().await.unwrap(), Some(ExitCode::SUCCESS));
    }

    #[tokio::test]
    async fn gen_secret_refuses_a_pipe() {
        // Under `cargo test` stdout is not a terminal, so the guard fires (critic #12).
        let mut app = App::from_args(spec(), argv(&["gen-secret"]), Router::new()).unwrap();
        assert!(app.loaded.is_none(), "gen-secret reads no configuration");
        let err = app.control().await.unwrap_err();
        assert!(err.remedy.contains("terminal"));
    }

    #[test]
    fn unknown_flag_is_refused_with_remedy() {
        let err = App::from_args(spec(), argv(&["--bogus"]), Router::new())
            .err()
            .expect("an unknown flag is an error");
        assert!(err.remedy.contains("--help"));
    }

    #[test]
    fn shipped_defaults_pass_their_own_validation() {
        // HTTPSwitchboard rule: the defaults must survive the parser.
        let dir = tempfile::tempdir().unwrap();
        let app = App::from_args(spec(), argv(&base_args(dir.path())), Router::new()).unwrap();
        assert_eq!(app.limits.max_body_bytes, 1_048_576);
        assert_eq!(app.limits.max_in_flight, 64);
        assert_eq!(app.limits.request_timeout, Duration::from_secs(30));
        assert_eq!(app.limits.remember_me_secs, 30 * 86_400);
        assert!(app.limits.trusted_proxies.is_empty());
        let mut bad = base_args(dir.path());
        bad.extend(["--max-in-flight", "0"]);
        let err = App::from_args(spec(), argv(&bad), Router::new())
            .err()
            .expect("zero in-flight is refused");
        assert!(err.message.contains("max_in_flight"));
    }

    #[tokio::test]
    async fn check_runs_project_hooks_and_reports_their_remedy() {
        let dir = tempfile::tempdir().unwrap();
        // With the dashboard compiled in, --check needs the secrets first (W6).
        let mut args = secrets_env(dir.path());
        args.push("--check");
        let mut app = App::from_args(spec(), argv(&args), Router::new()).unwrap();
        app.on_check(|| {
            Err(Error::config(
                "store is from the future",
                "downgrade is not possible; restore the pre-update copy",
            ))
        });
        let err = app.control().await.unwrap_err();
        assert!(err.remedy.contains("pre-update copy"));

        let err = App::from_args(
            spec(),
            argv(&[
                "--check",
                "--state-dir",
                dir.path().to_str().unwrap(),
                "--listen",
                "not-an-address",
            ]),
            Router::new(),
        )
        .err()
        .expect("a bad listen address is an error");
        assert!(err.message.contains("listen address"));
    }

    struct Store(bool);
    impl Subsystem for Store {
        fn name(&self) -> &str {
            "store"
        }
        fn check(&self) -> SubsystemStatus {
            if self.0 {
                SubsystemStatus::ok("writable")
            } else {
                SubsystemStatus::failing("read-only filesystem")
            }
        }
    }

    struct Scraper;
    impl ScrapeSource for Scraper {
        fn scrape(&self) -> String {
            "project_things_total 7\n".to_string()
        }
    }

    /// The dashboard needs both secrets to start; the core-only tests set
    /// them so `start()` is reachable whatever features are compiled.
    fn secrets_env(dir: &std::path::Path) -> Vec<&'static str> {
        let mut v = base_args(dir);
        v.extend([
            "--token",
            "a-login-token-that-is-long-enough",
            "--secret-key",
            Box::leak("ab".repeat(32).into_boxed_str()),
        ]);
        v
    }

    #[tokio::test]
    async fn start_serves_kit_routes_and_stops_cleanly() {
        let dir = tempfile::tempdir().unwrap();
        let mut app = App::from_args(
            spec(),
            argv(&secrets_env(dir.path())),
            Router::new().route("/", get(|| async { "hi" })),
        )
        .unwrap();
        assert!(app.control.is_none());
        let flushed = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let f2 = flushed.clone();
        app.on_flush(move || f2.store(true, std::sync::atomic::Ordering::SeqCst));
        app.subsystem(Store(true)).metrics_source(Scraper);
        let running = app.start().await.unwrap();
        assert_ne!(running.addr.port(), 0);
        let base = format!("http://{}", running.addr);

        let body = reqwest::get(format!("{base}/"))
            .await
            .unwrap()
            .text()
            .await
            .unwrap();
        assert_eq!(body, "hi");

        // K6: /healthz carries the version and the subsystem.
        let res = reqwest::get(format!("{base}/healthz")).await.unwrap();
        assert_eq!(res.status(), 200);
        let v: serde_json::Value = res.json().await.unwrap();
        assert_eq!(v["version"], "9.8.7");
        assert_eq!(v["status"], "ok");
        assert_eq!(v["subsystems"]["store"]["detail"], "writable");

        // K7: /metrics has the kit baseline, the counted requests and the verbatim source.
        let text = reqwest::get(format!("{base}/metrics"))
            .await
            .unwrap()
            .text()
            .await
            .unwrap();
        assert!(
            text.contains("t_app_build_info{version=\"9.8.7\"} 1"),
            "{text}"
        );
        assert!(
            text.contains("t_app_http_requests_total{route=\"/healthz\",status=\"200\"}"),
            "{text}"
        );
        assert!(text.contains("project_things_total 7"), "{text}");

        // --healthcheck against the running instance: alive.
        let probe = health::probe(&format!("{base}/healthz"), Duration::from_secs(2))
            .await
            .unwrap();
        assert!(probe.alive);

        running.stop().await;
        assert!(
            flushed.load(std::sync::atomic::Ordering::SeqCst),
            "flush hook ran after drain"
        );
    }

    #[tokio::test]
    async fn degraded_subsystem_gives_503_but_probe_still_says_alive() {
        let dir = tempfile::tempdir().unwrap();
        let mut app =
            App::from_args(spec(), argv(&secrets_env(dir.path())), Router::new()).unwrap();
        app.subsystem(Store(false));
        let running = app.start().await.unwrap();
        let url = format!("http://{}/healthz", running.addr);
        let res = reqwest::get(&url).await.unwrap();
        assert_eq!(res.status(), 503);
        // Critic #3: liveness is a different question from health.
        let probe = health::probe(&url, Duration::from_secs(2)).await.unwrap();
        assert!(probe.alive);
        assert_eq!(probe.status, "degraded");
        running.stop().await;
    }

    #[tokio::test]
    async fn body_cap_answers_413() {
        let dir = tempfile::tempdir().unwrap();
        let mut args = secrets_env(dir.path());
        args.extend(["--max-body-bytes", "16"]);
        let app = App::from_args(
            spec(),
            argv(&args),
            Router::new().route(
                "/in",
                axum::routing::post(|body: String| async move { body }),
            ),
        )
        .unwrap();
        let running = app.start().await.unwrap();
        let client = reqwest::Client::new();
        let res = client
            .post(format!("http://{}/in", running.addr))
            .body("x".repeat(64))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), 413);
        let res = client
            .post(format!("http://{}/in", running.addr))
            .body("short")
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), 200);
        running.stop().await;
    }
}
