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
use crate::shell::config_load::Loaded;
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
    /// `owner/repo` on GitHub; the default release host for self-update is
    /// `https://github.com/<repository>/releases/latest/download` (K18).
    pub repository: Option<&'static str>,
}

impl Default for AppSpec {
    fn default() -> Self {
        Self {
            name: "service",
            version: "0.0.0",
            default_state_dir: None,
            default_listen: "0.0.0.0:8080",
            repository: None,
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
            k("reveal_seconds", Some("10")),
            // K9 — the https origin the dashboard is reached at (passkeys)
            k("public_url", None),
            // L5 — self-update (K18–K21)
            k("update_mode", Some("off")),
            k("update_url", None),
            k("update_asset", None),
            k("update_interval_secs", Some("21600")),
            k("update_startup_delay_secs", Some("300")),
            k("update_healthy_after_secs", Some("60")),
            k("update_max_start_attempts", Some("2")),
            k("update_hold", Some("")),
            k("update_drill", Some("")),
            k("update_keep_copies", Some("3")),
            k("update_probe_timeout_secs", Some("30")),
            k("update_download_timeout_secs", Some("300")),
            k("update_copies_dir", None),
            k("update_pubkey", None),
            k("update_allow_insecure", Some("false")),
            k("update_max_download_bytes", Some("268435456")),
            k("timeout_stop_secs", None),
            // L5 — notifications (K22)
            k("notify_timeout_secs", Some("10")),
            k("notify_retries", Some("3")),
            k("notify_backoff_base_ms", Some("500")),
            k("notify_backoff_cap_ms", Some("30000")),
            k("notify_queue_size", Some("1024")),
            k("health_sample_secs", Some("30")),
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
    /// `<name> update`: one supervised update attempt, exit 0/1 (K18).
    Update,
    /// `<name> rekey`: re-encrypt the stores from `<P>_OLD_SECRET_KEY` to
    /// `<P>_SECRET_KEY` (K8, critic #11).
    Rekey,
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
    pub public_url: Option<String>,
    pub update: UpdateKnobs,
    pub notify: NotifyKnobs,
}

/// The self-update knobs as parsed (AR3); used only with `self-update`.
#[derive(Debug, Clone)]
pub struct UpdateKnobs {
    pub mode: String,
    pub url: Option<String>,
    pub asset: Option<String>,
    pub interval: Duration,
    pub startup_delay: Duration,
    pub healthy_after: Duration,
    pub max_start_attempts: u32,
    pub hold: String,
    pub drill: String,
    pub keep_copies: usize,
    pub probe_timeout: Duration,
    pub download_timeout: Duration,
    pub copies_dir: Option<PathBuf>,
    /// A minisign public key replacing the compiled-in one (drills, staging).
    pub pubkey: Option<String>,
    pub allow_insecure: bool,
    pub max_download_bytes: u64,
}

/// The notifier knobs as parsed (AR3); used only with `notify`.
#[derive(Debug, Clone)]
pub struct NotifyKnobs {
    pub timeout: Duration,
    pub retries: u32,
    pub backoff_base: Duration,
    pub backoff_cap: Duration,
    pub queue_size: usize,
    pub health_sample: Duration,
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
    #[cfg(feature = "dashboard")]
    pub(crate) dash: DashboardRegistry,
    #[cfg(feature = "self-update")]
    state_copy: Option<crate::shell::update::StateCopy>,
    #[cfg(feature = "notify")]
    notifier: crate::shell::notify::Notifier,
    #[cfg(feature = "notify")]
    notify_drain: Option<crate::shell::notify::Drain>,
}

/// What a project registers for the dashboard (K16, K17); read once at start.
#[cfg(feature = "dashboard")]
#[derive(Default)]
pub struct DashboardRegistry {
    pub nav: Vec<crate::shell::dashboard::NavEntry>,
    pub sections: Vec<Arc<dyn crate::shell::dashboard::StatusSection>>,
    pub columns: Vec<Arc<dyn crate::shell::dashboard::ClientColumn>>,
    pub problems: Option<Arc<dyn Fn() -> Vec<crate::shell::dashboard::Problem> + Send + Sync>>,
    pub update: Option<Arc<dyn Fn() -> crate::shell::dashboard::UpdateView + Send + Sync>>,
    pub clients_label: Option<String>,
}

/// A started service: its address and the handle to stop it.
pub struct Running {
    pub addr: SocketAddr,
    stop: oneshot::Sender<()>,
    task: tokio::task::JoinHandle<()>,
    shutdown_timeout: Duration,
    flushes: Vec<Box<dyn FnOnce() + Send>>,
}

/// `true`/`false` (also `1`/`0`, `yes`/`no`); anything else is a config
/// error naming the knob, so `--check` catches a typo.
fn parse_bool(loaded: &Loaded, key: &str) -> Result<bool, Error> {
    match loaded
        .get(key)
        .unwrap_or("false")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "true" | "1" | "yes" | "on" => Ok(true),
        "false" | "0" | "no" | "off" | "" => Ok(false),
        other => Err(Error::config(
            format!("{key} must be true or false, not `{other}`"),
            "set it to true or false",
        )),
    }
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
        #[allow(unused_variables)]
        let spec_name = spec.name;
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
            #[cfg(feature = "dashboard")]
            dash: DashboardRegistry::default(),
            #[cfg(feature = "self-update")]
            state_copy: None,
            #[cfg(feature = "notify")]
            notifier: crate::shell::notify::Notifier::logging_only(spec_name),
            #[cfg(feature = "notify")]
            notify_drain: None,
        }
    }

    /// Parse `args` (argv[0] included) and load configuration. Nothing
    /// here opens a socket or touches the state directory.
    pub fn from_args(spec: AppSpec, args: Vec<String>, router: Router) -> Result<App, Error> {
        Self::from_args_with_env(
            spec,
            args,
            crate::shell::config_load::env_snapshot(),
            router,
        )
    }

    /// `from_args` with an explicit environment map instead of the
    /// process's. Secrets travel only through the environment (S8), so
    /// tests and embedders use this to supply them without `set_var`.
    pub fn from_args_with_env(
        spec: AppSpec,
        args: Vec<String>,
        env: BTreeMap<String, String>,
        router: Router,
    ) -> Result<App, Error> {
        let knobs = spec.knobs();
        let mut cmd = Command::new(spec.name.to_string())
            .version(spec.version)
            .disable_version_flag(true)
            .subcommand(
                Command::new("gen-secret")
                    .about("Print a fresh login token and secret key for the environment file (terminal only)"),
            )
            .subcommand(
                Command::new("update")
                    .about("One supervised update attempt: verify, install, exit 0 (also when already current); never restarts"),
            )
            .subcommand(
                Command::new("rekey")
                    .about("Re-encrypt every store under a new secret key: set <PREFIX>_OLD_SECRET_KEY to the previous key and <PREFIX>_SECRET_KEY to the new one, then run this once (service stopped)"),
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
            // S8: secrets never travel on argv (/proc/*/cmdline is world-
            // readable); they come from the environment only.
            if k.secret {
                continue;
            }
            cmd = cmd.arg(
                Arg::new(k.key)
                    .long(k.flag_name().trim_start_matches("--").to_string())
                    .value_name("VALUE")
                    .action(ArgAction::Set)
                    // Knobs are accepted before or after a subcommand, so
                    // `<name> update --update-url ...` works as the homelab's
                    // update_cmd would write it.
                    .global(true)
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
            if k.secret {
                continue;
            }
            if let Some(v) = matches.get_one::<String>(k.key) {
                flags.insert(k.key.to_string(), v.clone());
            }
        }
        let loaded = crate::shell::config_load::load_with_env(
            &spec.prefix(),
            &knobs,
            flags,
            &spec.state_dir_default(),
            env.clone(),
        )?;

        let control = if matches.get_flag("print-config") {
            Some(Control::PrintConfig)
        } else if matches.get_flag("check") {
            Some(Control::Check)
        } else if matches.subcommand_matches("update").is_some() {
            Some(Control::Update)
        } else if matches.subcommand_matches("rekey").is_some() {
            Some(Control::Rekey)
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
            public_url: loaded.get("public_url").map(|s| s.to_string()),
            update: UpdateKnobs {
                mode: loaded.get("update_mode").unwrap_or("off").to_string(),
                url: loaded.get("update_url").map(|s| s.to_string()),
                asset: loaded.get("update_asset").map(|s| s.to_string()),
                interval: Duration::from_secs(parse_u64(&loaded, "update_interval_secs", 60)?),
                startup_delay: Duration::from_secs(parse_u64(
                    &loaded,
                    "update_startup_delay_secs",
                    0,
                )?),
                healthy_after: Duration::from_secs(parse_u64(
                    &loaded,
                    "update_healthy_after_secs",
                    1,
                )?),
                max_start_attempts: parse_u64(&loaded, "update_max_start_attempts", 1)? as u32,
                hold: loaded.get("update_hold").unwrap_or("").to_string(),
                drill: loaded.get("update_drill").unwrap_or("").to_string(),
                keep_copies: parse_u64(&loaded, "update_keep_copies", 1)? as usize,
                probe_timeout: Duration::from_secs(parse_u64(
                    &loaded,
                    "update_probe_timeout_secs",
                    1,
                )?),
                download_timeout: Duration::from_secs(parse_u64(
                    &loaded,
                    "update_download_timeout_secs",
                    1,
                )?),
                copies_dir: loaded.get("update_copies_dir").map(PathBuf::from),
                pubkey: loaded
                    .get("update_pubkey")
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
                allow_insecure: parse_bool(&loaded, "update_allow_insecure")?,
                max_download_bytes: parse_u64(&loaded, "update_max_download_bytes", 1)?,
            },
            notify: NotifyKnobs {
                timeout: Duration::from_secs(parse_u64(&loaded, "notify_timeout_secs", 1)?),
                retries: parse_u64(&loaded, "notify_retries", 0)? as u32,
                backoff_base: Duration::from_millis(parse_u64(
                    &loaded,
                    "notify_backoff_base_ms",
                    1,
                )?),
                backoff_cap: Duration::from_millis(parse_u64(&loaded, "notify_backoff_cap_ms", 1)?),
                queue_size: parse_u64(&loaded, "notify_queue_size", 1)? as usize,
                health_sample: Duration::from_secs(parse_u64(&loaded, "health_sample_secs", 1)?),
            },
        };
        // The update knobs are validated at parse time so --check refuses them.
        #[cfg(feature = "self-update")]
        {
            crate::core::update::Mode::parse(&limits.update.mode)?;
            crate::core::update::Hold::parse(&limits.update.hold)?;
            if !matches!(
                limits.update.drill.as_str(),
                "" | "broken" | "broken-after-ready"
            ) {
                return Err(Error::config(
                    format!(
                        "update_drill `{}` is not one of broken, broken-after-ready",
                        limits.update.drill
                    ),
                    "leave it empty unless you are running the broken-release drill",
                ));
            }
            if let Some(key) = &limits.update.pubkey {
                minisign_verify::PublicKey::from_base64(key).map_err(|e| {
                    Error::config(
                        format!("update_pubkey is not a minisign public key: {e}"),
                        "paste the base64 line of the drill key's minisign.pub, or unset it to trust the ecosystem key",
                    )
                })?;
            }
            if limits.update.mode != "off"
                && limits.update.url.is_none()
                && spec.repository.is_none()
            {
                return Err(Error::config(
                    "update_mode is on but neither update_url nor AppSpec.repository says where releases live",
                    "set update_url to the directory holding VERSION, SHA256SUMS, SHA256SUMS.minisig and the binary, or set AppSpec.repository",
                ));
            }
        }
        #[cfg(feature = "notify")]
        let (notifier, notify_drain) = {
            let hooks = crate::core::notify::webhooks_from_table(&loaded.file_table, &env)?;
            crate::shell::notify::Notifier::prepare(
                spec.name,
                hooks,
                crate::shell::notify::NotifyConfig {
                    timeout: limits.notify.timeout,
                    retries: limits.notify.retries,
                    backoff_base: limits.notify.backoff_base,
                    backoff_cap: limits.notify.backoff_cap,
                    queue_size: limits.notify.queue_size,
                },
            )
        };
        // A malformed PUBLIC_URL is refused at parse time; its ABSENCE is
        // refused by --check and start (after the secrets check), so the
        // secrets remedy is the first thing an unconfigured service says.
        #[cfg(feature = "passkeys")]
        if let Some(url) = limits.public_url.as_deref() {
            crate::shell::passkeys::build_webauthn(spec.name, &spec.prefix(), Some(url))?;
        }

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
            #[cfg(feature = "dashboard")]
            dash: DashboardRegistry::default(),
            #[cfg(feature = "self-update")]
            state_copy: None,
            #[cfg(feature = "notify")]
            notifier,
            #[cfg(feature = "notify")]
            notify_drain,
        })
    }

    /// The handle to send the project's own events through (K22). Valid
    /// right after `from_args`; delivery starts with `start`.
    #[cfg(feature = "notify")]
    pub fn notifier(&self) -> crate::shell::notify::Notifier {
        self.notifier.clone()
    }

    /// How the project produces a consistent copy of its state into `dest`
    /// before a binary swap (K21; kyu's `VACUUM INTO`).
    #[cfg(feature = "self-update")]
    pub fn state_copy(
        &mut self,
        f: impl Fn(&std::path::Path) -> Result<(), Error> + Send + Sync + 'static,
    ) -> &mut Self {
        self.state_copy = Some(Arc::new(f));
        self
    }

    /// Build the updater from the knobs (K18). `force_supervised` is what
    /// the `update` subcommand does regardless of the configured mode.
    #[cfg(feature = "self-update")]
    fn build_updater(
        &self,
        force_supervised: bool,
    ) -> Result<Arc<crate::shell::update::Updater>, Error> {
        use crate::core::update::{Hold, Mode, Version};
        use crate::shell::update::{UpdateConfig, Updater};
        let loaded = self.loaded.as_ref().expect("loaded");
        let k = &self.limits.update;
        let mode = if force_supervised {
            Mode::Supervised
        } else {
            Mode::parse(&k.mode)?
        };
        let url = match (&k.url, self.spec.repository) {
            (Some(u), _) => u.clone(),
            (None, Some(repo)) => format!("https://github.com/{repo}/releases/latest/download"),
            (None, None) => String::new(),
        };
        let binary = std::env::current_exe().map_err(|e| {
            Error::internal(format!("cannot find my own binary: {e}"), "report this")
        })?;
        let copies_dir = k.copies_dir.clone().unwrap_or_else(|| {
            let mut p = loaded.state_dir.clone();
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            p.set_file_name(format!("{name}-pre-update"));
            p
        });
        #[cfg(feature = "notify")]
        let sink: crate::shell::update::EventSink = {
            let n = self.notifier.clone();
            Arc::new(move |e: crate::shell::update::Event| n.emit(e.kind, &e.version, e.detail))
        };
        #[cfg(not(feature = "notify"))]
        let sink: crate::shell::update::EventSink = Arc::new(
            |e: crate::shell::update::Event| tracing::info!(event = e.kind, version = %e.version, detail = %e.detail, "event"),
        );
        let updater = Updater::new(
            UpdateConfig {
                mode,
                url,
                asset_name: k
                    .asset
                    .clone()
                    .unwrap_or_else(|| self.spec.name.to_string()),
                interval: k.interval,
                startup_delay: k.startup_delay,
                healthy_after: k.healthy_after,
                max_start_attempts: k.max_start_attempts,
                hold: Hold::parse(&k.hold)?,
                drill: if k.drill.is_empty() {
                    None
                } else {
                    Some(k.drill.clone())
                },
                keep_copies: k.keep_copies,
                probe_timeout: k.probe_timeout,
                download_timeout: k.download_timeout,
                pubkey: k
                    .pubkey
                    .clone()
                    .unwrap_or_else(|| crate::shell::update::RELEASE_PUBKEY.to_string()),
                pubkey_overridden: k.pubkey.is_some(),
                repo: self.spec.repository.map(|r| r.to_string()),
                allow_insecure: k.allow_insecure,
                max_download_bytes: k.max_download_bytes,
                copies_dir,
            },
            binary,
            loaded.state_dir.clone(),
            Version::parse(self.spec.version)?,
            sink,
            self.state_copy.clone(),
        )?;
        Ok(Arc::new(updater))
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

    /// A link in the dashboard's top navigation (K16).
    #[cfg(feature = "dashboard")]
    pub fn nav_entry(&mut self, label: &str, href: &str) -> &mut Self {
        self.dash.nav.push(crate::shell::dashboard::NavEntry {
            label: label.to_string(),
            href: href.to_string(),
        });
        self
    }

    /// A section on the status page (K17).
    #[cfg(feature = "dashboard")]
    pub fn status_section(
        &mut self,
        s: impl crate::shell::dashboard::StatusSection + 'static,
    ) -> &mut Self {
        self.dash.sections.push(Arc::new(s));
        self
    }

    /// An extra column on the clients table (K16).
    #[cfg(feature = "dashboard")]
    pub fn client_column(
        &mut self,
        c: impl crate::shell::dashboard::ClientColumn + 'static,
    ) -> &mut Self {
        self.dash.columns.push(Arc::new(c));
        self
    }

    /// The problems card's source (K17): configuration seen but not usable.
    #[cfg(feature = "dashboard")]
    pub fn problems(
        &mut self,
        f: impl Fn() -> Vec<crate::shell::dashboard::Problem> + Send + Sync + 'static,
    ) -> &mut Self {
        self.dash.problems = Some(Arc::new(f));
        self
    }

    /// What the clients page is called in this service ("Sources" for
    /// Almanac); code and URL stay `clients` (E1).
    #[cfg(feature = "dashboard")]
    pub fn clients_label(&mut self, label: &str) -> &mut Self {
        self.dash.clients_label = Some(label.to_string());
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
            Some(_) => {
                #[cfg(feature = "passkeys")]
                crate::shell::passkeys::build_webauthn(
                    self.spec.name,
                    &prefix,
                    self.limits.public_url.as_deref(),
                )?;
                Ok(())
            }
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
            Some(Control::Rekey) => {
                let loaded = self.loaded.as_ref().expect("loaded");
                let prefix = self.spec.prefix();
                #[cfg(feature = "dashboard")]
                let new_key = {
                    let secrets = crate::shell::auth::Secrets::parse(
                        &prefix,
                        loaded.get("token"),
                        loaded.get("secret_key"),
                    )?
                    .ok_or_else(|| {
                        Error::config(
                            format!("rekey needs the NEW key in {prefix}_SECRET_KEY (with {prefix}_TOKEN)"),
                            "export the new pair, the previous key as {prefix}_OLD_SECRET_KEY, then run rekey again",
                        )
                    })?;
                    secrets.key.clone()
                };
                #[cfg(not(feature = "dashboard"))]
                let new_key = {
                    let mut candidate = [0u8; 32];
                    getrandom::fill(&mut candidate)
                        .map_err(|e| Error::internal(format!("random: {e}"), "report this"))?;
                    let env = format!("{prefix}_SECRET_KEY");
                    let raw = loaded.get("secret_key").ok_or_else(|| {
                        Error::config(format!("{env} is not set"), "export the new key first")
                    })?;
                    crate::core::crypto::Key::parse_hex(&env, raw, &hex::encode(candidate))?
                };
                let old_env = format!("{prefix}_OLD_SECRET_KEY");
                let old_raw = std::env::var(&old_env).map_err(|_| {
                    Error::config(
                        format!("{old_env} is not set"),
                        format!("export the previous secret key as {old_env} and the new one as {prefix}_SECRET_KEY, stop the service, then run rekey"),
                    )
                })?;
                let mut candidate = [0u8; 32];
                getrandom::fill(&mut candidate)
                    .map_err(|e| Error::internal(format!("random: {e}"), "report this"))?;
                let old_key = crate::core::crypto::Key::parse_hex(
                    &old_env,
                    &old_raw,
                    &hex::encode(candidate),
                )?;
                let done = crate::shell::store::rekey_dir(&loaded.state_dir, &old_key, &new_key)?;
                println!(
                    "{}: {} store file(s) in {} now sealed under {prefix}_SECRET_KEY; unset {old_env} and start the service",
                    self.spec.name,
                    done,
                    loaded.state_dir.display()
                );
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
                // H11 (rule 12, fail-closed): the state directory must exist
                // and take a write NOW, not at the first login. The only
                // thing --check touches is a zero-byte probe, removed at once.
                let loaded = self.loaded.as_ref().expect("loaded");
                crate::shell::store::probe_state_dir(&loaded.state_dir, false)?;
                for warning in self.startup_warnings() {
                    eprintln!("warning: {warning}");
                }
                for check in self.checks.drain(..) {
                    check()?;
                }
                println!("{}: configuration ok", self.spec.name);
                Ok(Some(ExitCode::SUCCESS))
            }
            Some(Control::Update) => {
                #[cfg(feature = "self-update")]
                {
                    use crate::shell::update::Outcome;
                    let updater = self.build_updater(true)?;
                    match updater.check_once().await? {
                        Outcome::Current { latest } => println!(
                            "{}: already current ({latest}); nothing touched",
                            self.spec.name
                        ),
                        Outcome::Held { latest } => println!(
                            "{}: {latest} is available but held; nothing touched",
                            self.spec.name
                        ),
                        Outcome::Blocked { pending } => println!(
                            "{}: an update to {pending} is still on probation; nothing touched",
                            self.spec.name
                        ),
                        Outcome::Installed { from, to } => println!(
                            "{}: installed {to} over {from}; restart to run it",
                            self.spec.name
                        ),
                    }
                    Ok(Some(ExitCode::SUCCESS))
                }
                #[cfg(not(feature = "self-update"))]
                Err(Error::invalid(
                    "this service was built without the self-update feature",
                    "updates arrive as a new binary or image; enable the `self-update` feature to change that",
                ))
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
        // AR15: the pending-update decision runs before anything opens a
        // store (critic #2), and the drill marker breaks only the version
        // it names (critic #6).
        #[cfg(feature = "self-update")]
        let (updater, drill) = {
            let updater = match self.build_updater(false) {
                Ok(u) => u,
                Err(e) => {
                    eprintln!("{e}");
                    return ExitCode::FAILURE;
                }
            };
            match updater.handle_pending_update() {
                Ok(true) => {
                    eprintln!(
                        "update reverted; exiting so the supervisor starts the restored binary"
                    );
                    return ExitCode::SUCCESS;
                }
                Ok(false) => {}
                Err(e) => {
                    eprintln!("{e}");
                    return ExitCode::FAILURE;
                }
            }
            let drill = updater.drill_kind();
            if drill.as_deref() == Some("broken") {
                eprintln!(
                    "DRILL: this version exits before READY on purpose (update_drill=broken)"
                );
                return ExitCode::FAILURE;
            }
            (updater, drill)
        };
        // Registered before the bind so no SIGTERM can slip in unhandled
        // between "listening" and the first poll of the listener (rule 8a).
        let stop = lifecycle::stop_signals();
        match self.start().await {
            Ok(running) => {
                // A future that resolves when the autonomous updater installed
                // a release and wants the restart; pending forever otherwise
                // (a dropped sender would resolve at once and stop the service
                // right after it started — the L5 E2E run caught that).
                #[cfg(feature = "self-update")]
                let restart: std::pin::Pin<
                    Box<dyn std::future::Future<Output = ()> + Send>,
                > = {
                    use crate::core::update::Mode;
                    if drill.as_deref() == Some("broken-after-ready") {
                        tracing::warn!(
                            "DRILL: exiting 1 five seconds after READY (update_drill=broken-after-ready)"
                        );
                        tokio::spawn(async {
                            tokio::time::sleep(Duration::from_secs(5)).await;
                            std::process::exit(1);
                        });
                    }
                    if updater.effective.mode == Mode::Autonomous {
                        let (tx, rx) = oneshot::channel::<()>();
                        let u = updater.clone();
                        tokio::spawn(async move {
                            tokio::time::sleep(u.cfg.healthy_after).await;
                            u.confirm_healthy();
                        });
                        let u = updater.clone();
                        tokio::spawn(async move {
                            u.run_autonomous().await;
                            let _ = tx.send(());
                        });
                        Box::pin(async move {
                            let _ = rx.await;
                        })
                    } else {
                        Box::pin(std::future::pending())
                    }
                };
                #[cfg(feature = "self-update")]
                tokio::select! {
                    _ = stop.wait() => {}
                    _ = restart => {
                        tracing::info!("stopping for the update restart");
                    }
                }
                #[cfg(not(feature = "self-update"))]
                stop.wait().await;
                running.stop().await;
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("{e}");
                ExitCode::FAILURE
            }
        }
    }

    /// Configuration that loads but will hurt (S4, critic #20): said at
    /// `--check` (stderr) and at start (log), never silently.
    fn startup_warnings(&self) -> Vec<String> {
        let mut w = Vec::new();
        let loaded = self.loaded.as_ref().expect("loaded");
        let prefix = self.spec.prefix();
        if self.limits.trusted_proxies.is_empty() && !self.listen.ip().is_loopback() {
            w.push(format!(
                "trusted_proxies is empty while listening on {}: behind a reverse proxy every client shares the proxy's IP (one attacker's failed logins lock everyone out), cookies are never Secure and passkeys stay off. What now: set {prefix}_TRUSTED_PROXIES to the proxy's IP, or bind to 127.0.0.1 if no proxy is involved",
                self.listen
            ));
        }
        if let Some(raw) = loaded.get("timeout_stop_secs")
            && let Ok(stop) = raw.trim().parse::<u64>()
            && Duration::from_secs(stop) < self.shutdown_timeout
        {
            w.push(format!(
                "the unit's TimeoutStopSec ({stop} s) is shorter than shutdown_timeout_ms ({} ms): systemd would SIGKILL a drain that is still running. What now: raise TimeoutStopSec in the unit (and {prefix}_TIMEOUT_STOP_SECS with it) or lower {prefix}_SHUTDOWN_TIMEOUT_MS",
                self.shutdown_timeout.as_millis()
            ));
        }
        w
    }

    /// Install logging and metrics, bind, announce readiness, serve.
    #[cfg_attr(not(feature = "notify"), allow(unused_mut))]
    pub async fn start(mut self) -> Result<Running, Error> {
        let loaded = self.loaded.as_ref().ok_or_else(|| {
            Error::internal(
                "start() called on a control-command app",
                "call run() instead",
            )
        })?;
        let filter = loaded.get("log").unwrap_or("info").to_string();
        let format = LogFormat::parse(loaded.get("log_format").unwrap_or("text"))?;
        logging::init(&filter, format)?;
        // H11: the state root is created and proven writable before anything
        // else, so a wrong ReadWritePaths or bind-mount owner fails here
        // with the chown remedy instead of as a 503 at the first login.
        crate::shell::store::probe_state_dir(&loaded.state_dir, true)?;
        for warning in self.startup_warnings() {
            tracing::warn!("{warning}");
        }
        self.subsystems
            .push(Arc::new(crate::shell::store::StoreSubsystem));
        #[cfg(feature = "notify")]
        if let Some(drain) = self.notify_drain.take() {
            tokio::spawn(drain);
        }
        #[cfg(feature = "self-update")]
        {
            // Rule 23 / rule 12: the mode decision is said out loud once,
            // with its reason and the trust root in force.
            let updater = self.build_updater(false)?;
            let trust_root = if updater.cfg.pubkey_overridden {
                "update_pubkey (OVERRIDDEN)"
            } else {
                "compiled-in ecosystem key"
            };
            tracing::info!(
                configured = %self.limits.update.mode,
                effective = updater.effective.mode.label(),
                reason = updater.effective.reason,
                trust_root,
                url = %updater.cfg.url,
                "self-update"
            );
            // K20: off and supervised still learn about newer releases,
            // read-only, so the status card is never decoration.
            if updater.effective.mode != crate::core::update::Mode::Autonomous
                && !updater.cfg.url.is_empty()
            {
                tokio::spawn(updater.clone().run_watch());
            }
            #[cfg(feature = "dashboard")]
            if self.dash.update.is_none() {
                let mode = updater.effective.mode.label().to_string();
                let reason = updater.effective.reason.to_string();
                let overridden = updater.cfg.pubkey_overridden;
                let no_url = updater.cfg.url.is_empty();
                self.dash.update = Some(Arc::new(move || {
                    let last = updater.last_check();
                    let mut note = last
                        .error
                        .or_else(|| last.outcome.clone())
                        .unwrap_or_else(|| reason.clone());
                    if no_url {
                        note = format!(
                            "{note}; no release host configured (update_url / AppSpec.repository), so no version check"
                        );
                    }
                    if overridden {
                        note = format!("{note}; TRUST ROOT OVERRIDDEN by update_pubkey");
                    }
                    crate::shell::dashboard::UpdateView {
                        mode: mode.clone(),
                        latest: last.latest.unwrap_or_else(|| "not checked yet".to_string()),
                        last_check: last.at.unwrap_or_else(|| "never".to_string()),
                        note: Some(note),
                    }
                }));
            }
        }

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
            kit_problems: Arc::new(std::sync::Mutex::new(Vec::new())),
            untrusted_proxy_warned: Arc::new(std::sync::atomic::AtomicBool::new(false)),
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
            .route("/healthz", get(health::healthz).with_state(health.clone()))
            .route("/metrics", get(metrics_handler).with_state(metrics));

        #[allow(unused_mut)]
        let mut router = self.router.merge(kit_routes);

        #[cfg(feature = "dashboard")]
        {
            let (protected, flush) =
                crate::app_dashboard::mount(crate::app_dashboard::MountInput {
                    spec: &self.spec,
                    loaded,
                    limits: &self.limits,
                    guards: guards.clone(),
                    addr,
                    api_router: self.api_router,
                    dashboard_router: self.dashboard_router,
                    test_route: self.test_route.clone(),
                    client_store: self.client_store.clone(),
                    registry: self.dash,
                    health: health.clone(),
                })
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
        #[cfg(feature = "notify")]
        {
            self.notifier.emit(
                "service.started",
                self.spec.version,
                format!("listening on {addr}"),
            );
            // health.degraded / health.recovered, once per transition (debounced by construction).
            let n = self.notifier.clone();
            let h = health.clone();
            let every = self.limits.notify.health_sample;
            let version = self.spec.version;
            tokio::spawn(async move {
                let mut degraded = false;
                loop {
                    tokio::time::sleep(every).await;
                    let report = h.report().await;
                    let now_degraded = report.status != "ok";
                    if now_degraded != degraded {
                        degraded = now_degraded;
                        let detail = serde_json::to_string(&report.subsystems).unwrap_or_default();
                        n.emit(
                            if degraded {
                                "health.degraded"
                            } else {
                                "health.recovered"
                            },
                            version,
                            detail,
                        );
                    }
                }
            });
        }
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
            public_url: None,
            update: UpdateKnobs {
                mode: "off".into(),
                url: None,
                asset: None,
                pubkey: None,
                allow_insecure: false,
                max_download_bytes: 268_435_456,
                interval: Duration::from_secs(60),
                startup_delay: Duration::from_secs(0),
                healthy_after: Duration::from_secs(1),
                max_start_attempts: 2,
                hold: String::new(),
                drill: String::new(),
                keep_copies: 1,
                probe_timeout: Duration::from_secs(1),
                download_timeout: Duration::from_secs(1),
                copies_dir: None,
            },
            notify: NotifyKnobs {
                timeout: Duration::from_secs(1),
                retries: 0,
                backoff_base: Duration::from_millis(1),
                backoff_cap: Duration::from_millis(1),
                queue_size: 1,
                health_sample: Duration::from_secs(1),
            },
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
            // Read only when the passkeys feature is compiled in (K9).
            "--public-url",
            "https://t.example",
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
        let mut app = from_args_secret(spec(), argv(&args), Router::new()).unwrap();
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

    /// H2: every `<binary> <command>` a remedy tells the operator to run is a
    /// real subcommand — a remedy naming a command that does not exist is a
    /// lie the tests used to check for by word, not by existence.
    #[test]
    fn every_command_named_in_a_remedy_exists() {
        let sources = [
            include_str!("app.rs"),
            include_str!("core/crypto.rs"),
            include_str!("core/error.rs"),
            include_str!("shell/auth.rs"),
            include_str!("shell/store.rs"),
            include_str!("shell/update.rs"),
            include_str!("shell/config_load.rs"),
        ];
        let mut named = std::collections::BTreeSet::new();
        for src in sources {
            for (i, _) in src.match_indices("<binary> ") {
                let rest = &src[i + "<binary> ".len()..];
                let word: String = rest
                    .chars()
                    .take_while(|c| c.is_ascii_alphanumeric() || *c == '-')
                    .collect();
                if !word.is_empty() && !word.starts_with("--") {
                    named.insert(word);
                }
            }
        }
        assert!(named.contains("rekey"), "{named:?}");
        for word in named {
            let parsed = App::from_args(spec(), argv(&[&word]), Router::new());
            assert!(
                parsed.is_ok(),
                "remedies name `<binary> {word}` but it does not parse as a command: {:?}",
                parsed.err().map(|e| e.message)
            );
        }
    }

    /// The dashboard needs both secrets to start; the core-only tests set
    /// them so `start()` is reachable whatever features are compiled.
    fn secrets_env(dir: &std::path::Path) -> Vec<&'static str> {
        base_args(dir)
    }

    /// The two dashboard secrets, as the environment carries them (S8:
    /// never as flags).
    fn secret_map() -> BTreeMap<String, String> {
        BTreeMap::from([
            (
                "T_APP_TOKEN".to_string(),
                "a-login-token-that-is-long-enough".to_string(),
            ),
            ("T_APP_SECRET_KEY".to_string(), "ab".repeat(32)),
            (
                "T_APP_PUBLIC_URL".to_string(),
                "https://t.example".to_string(),
            ),
        ])
    }

    fn from_args_secret(spec: AppSpec, args: Vec<String>, router: Router) -> Result<App, Error> {
        App::from_args_with_env(spec, args, secret_map(), router)
    }

    #[tokio::test]
    async fn start_serves_kit_routes_and_stops_cleanly() {
        let dir = tempfile::tempdir().unwrap();
        let mut app = from_args_secret(
            spec(),
            argv(&secrets_env(dir.path())),
            // `/` belongs to the kit's status page when the dashboard is compiled in.
            Router::new().route("/hello", get(|| async { "hi" })),
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

        let body = reqwest::get(format!("{base}/hello"))
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
            from_args_secret(spec(), argv(&secrets_env(dir.path())), Router::new()).unwrap();
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
        let app = from_args_secret(
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
