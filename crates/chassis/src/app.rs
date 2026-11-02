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
//! (`--version`, `--knobs`, `--check`, `--print-config`, `--healthcheck`,
//! `gen-secret`) without opening a listening socket, start logging, bind,
//! tell systemd we are ready, serve, and stop cleanly on SIGTERM. Control
//! commands are dispatched in `run`, not in `from_args`, so a project's
//! hooks are registered by the time `--check` runs (the critic's
//! objection #8). `--version` is the exception: it is answered before
//! configuration is even read (AR20).

use std::collections::HashSet;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use tokio::sync::oneshot;

use crate::core::error::Error;
use crate::shell::config_load::Loaded;
use crate::shell::health::Subsystem;
use crate::shell::metrics::ScrapeSource;
#[cfg(feature = "dashboard")]
use crate::shell::store::ClientStore;

mod backup_hooks;
mod cli;
#[cfg(feature = "dashboard")]
mod clients_ui;
mod construct;
mod control;
mod hooks;
mod knobs;
mod limits;
#[cfg(feature = "push")]
pub(crate) use limits::parse_u64;
#[cfg(feature = "notify")]
mod notify;
#[cfg(feature = "dashboard")]
mod pages;
mod project;
#[cfg(feature = "push")]
mod push;
mod rekey;
mod routes;
mod run;
#[cfg(feature = "self-update")]
mod self_update;
mod spec;
mod start;
mod stop;
#[cfg(feature = "storage")]
mod storage_open;
mod storage_setup;
#[cfg(test)]
mod tests;
mod validate;

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
    /// Text appended to `--help` (1.2.0): the project's own environment
    /// variables and subcommands, which the kit cannot know about.
    pub help_extra: Option<&'static str>,
    /// Opt in to running the dashboard OPEN when neither `<P>_TOKEN` nor
    /// `<P>_SECRET_KEY` is set: no login, every page and every API route
    /// answers anyone who can reach the port, a banner on every page and a
    /// warning on every start. Off by default: a service that does not opt
    /// in refuses to start without both secrets (kyu K2-4, 2026-09-06).
    pub open_dashboard: bool,
}

impl Default for AppSpec {
    fn default() -> Self {
        Self {
            name: "service",
            version: "0.0.0",
            default_state_dir: None,
            default_listen: "0.0.0.0:8080",
            repository: None,
            help_extra: None,
            open_dashboard: false,
        }
    }
}

/// The kit features this binary was compiled with, `core` first (K36).
/// `assets` is left out: it carries no knob and no page of its own, it is
/// what `dashboard` pulls in.
pub fn compiled_features() -> &'static [&'static str] {
    &[
        "core",
        #[cfg(feature = "dashboard")]
        "dashboard",
        #[cfg(feature = "passkeys")]
        "passkeys",
        #[cfg(feature = "self-update")]
        "self-update",
        #[cfg(feature = "notify")]
        "notify",
        #[cfg(feature = "storage")]
        "storage",
        #[cfg(feature = "push")]
        "push",
    ]
}

/// A control command the command line asked for; answered by `run`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Control {
    Version,
    /// `--help`: the rendered help text (1.2.0), printed on stdout, exit 0.
    Help(String),
    Check,
    PrintConfig,
    /// `--knobs`: the knob table as Markdown (K31), stdout, exit 0; like
    /// `--version` it is answered before configuration is read.
    Knobs,
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
    pub passkey_ceremony_cap: usize,
    pub passkey_ceremony_ttl: Duration,
    pub passkey_ceremonies_per_ip: usize,
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
    /// `update.failed` fires on the N-th consecutive failed check, once;
    /// `update.ok` when checks succeed again (A3, 1.4.0).
    pub notify_after_failures: u32,
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
    /// `None` only for `--version`, `--knobs` and `gen-secret`, which never
    /// read configuration.
    pub loaded: Option<Loaded>,
    pub listen: SocketAddr,
    pub shutdown_timeout: Duration,
    pub limits: Limits,
    pub control: Option<Control>,
    router: Router,
    shutdown: crate::shell::shutdown::ShutdownTrigger,
    api_router: Router,
    dashboard_router: Router,
    /// feat-webapp-1: the project's own browser app, if it registered one.
    #[cfg(feature = "webapp")]
    webapp: Vec<crate::shell::webapp::WebApp>,
    checks: Vec<Hook>,
    flush: Option<Box<dyn FnOnce() + Send>>,
    /// Run once the listener is bound and READY is sent (1.1.0): where a
    /// service spawns its background workers (pumps, pollers) so their
    /// first log lines land after logging is up and `--check` never
    /// starts them.
    start_hooks: Vec<Box<dyn FnOnce() + Send>>,
    /// feat-backup-1: `backup-pause` / `backup-resume`, answered by `control`
    /// before any configuration is read.
    backup_cmd: Option<crate::shell::backup::BackupCmd>,
    backup_pause_hooks: Vec<crate::shell::backup::PauseHook>,
    backup_resume_hooks: Vec<crate::shell::backup::ResumeHook>,
    backup_mode: crate::shell::backup::Mode,
    backup_paths: Vec<PathBuf>,
    /// 3.11.0: the sqlite files whose log the backup pause checkpoints and
    /// the pre-update copy snapshots (the kit's, the app's, registered ones).
    #[cfg(feature = "storage")]
    dbs: Vec<crate::storage::Db>,
    /// 3.11.0: the app database the project asked for, opened at start.
    #[cfg(feature = "storage")]
    app_db: Option<(crate::storage::AppDb, crate::storage::AppDbSpec)>,
    #[cfg(feature = "storage")]
    storage_kinds: Vec<crate::storage::DataKind>,
    #[cfg(feature = "storage")]
    storage_budget: Option<(u64, Option<u64>)>,
    #[cfg(feature = "storage")]
    storage_warn_hook: Option<crate::storage::WarnHook>,
    /// 3.12.0: the localStorage keys that sync to the database, and an
    /// optional store other than the app database.
    #[cfg(feature = "dashboard")]
    browser_keys: Option<crate::storage::BrowserKeys>,
    #[cfg(feature = "dashboard")]
    prefs_store: Option<Arc<dyn crate::storage::PrefStore>>,
    /// feat-pages-1: the project's pages, edits of the kit's, the brand
    /// link and the home route.
    #[cfg(feature = "dashboard")]
    pages: Vec<crate::shell::pages::Page>,
    #[cfg(feature = "dashboard")]
    kit_page_edits: Vec<(String, crate::shell::pages::KitPageEdit)>,
    #[cfg(feature = "dashboard")]
    brand: Option<String>,
    #[cfg(feature = "dashboard")]
    brand_title: Option<String>,
    #[cfg(feature = "dashboard")]
    disabled_kit_pages: Vec<String>,
    #[cfg(feature = "dashboard")]
    home: Option<String>,
    #[cfg(feature = "dashboard")]
    kit_pages_in_webapp: bool,
    subsystems: Vec<Arc<dyn Subsystem>>,
    scrape_sources: Vec<Arc<dyn ScrapeSource>>,
    timeout_exempt: HashSet<String>,
    /// Raised request-body caps per path prefix ([`App::body_limit`]).
    body_limits: Vec<(String, usize)>,
    /// Browser features opted back in on the `Permissions-Policy`.
    browser_features: Vec<String>,
    /// feat-guard-1: the project's checks in front of every route.
    #[cfg(feature = "request-guard")]
    request_guards: Vec<crate::shell::request_guard::RequestGuard>,
    #[cfg(feature = "request-guard")]
    request_guard_exempt: Vec<String>,
    #[cfg(feature = "dashboard")]
    test_route: Option<crate::shell::clients_api::TestRoute>,
    #[cfg(feature = "dashboard")]
    client_store: Option<Arc<dyn ClientStore>>,
    #[cfg(feature = "dashboard")]
    pub(crate) dash: DashboardRegistry,
    #[cfg(feature = "self-update")]
    state_copy: Option<crate::shell::update::StateCopy>,
    #[cfg(feature = "self-update")]
    update_gate: Option<crate::shell::update::UpdateGate>,
    #[cfg(feature = "self-update")]
    update_hook: Option<crate::shell::update::UpdateHook>,
    #[cfg(feature = "notify")]
    notifier: crate::shell::notify::Notifier,
    #[cfg(feature = "notify")]
    notify_drain: Option<crate::shell::notify::Drain>,
    /// 3.15.0: the app's own default addresses (`App::notify_targets`).
    #[cfg(feature = "notify")]
    notify_code_targets: Option<(String, Option<String>)>,
    /// habits-push-1: the handle the app sends Web Push with; connected when
    /// the dashboard is mounted.
    #[cfg(feature = "push")]
    push: crate::push::PushHandle,
}

/// What a project registers for the dashboard (K16, K17); read once at start.
#[cfg(feature = "dashboard")]
#[derive(Default)]
pub struct DashboardRegistry {
    pub nav: Vec<crate::shell::dashboard::NavEntry>,
    pub sections: Vec<Arc<dyn crate::shell::dashboard::StatusSection>>,
    pub columns: Vec<Arc<dyn crate::shell::dashboard::ClientColumn>>,
    pub form_fields: Vec<crate::shell::dashboard::ClientFormField>,
    pub on_client_issued: Option<crate::shell::clients_api::IssueHook>,
    pub on_client_deleted: Option<crate::shell::clients_api::DeleteHook>,
    pub problems: Option<Arc<dyn Fn() -> Vec<crate::shell::dashboard::Problem> + Send + Sync>>,
    pub update: Option<Arc<dyn Fn() -> crate::shell::dashboard::UpdateView + Send + Sync>>,
    /// kit-kp11: the checker behind the status page's "Check for updates".
    /// Not public: the kit sets it where it builds the updater.
    pub(crate) check_update: Option<crate::shell::dashboard::UpdateCheck>,
    pub clients_label: Option<String>,
    /// K28: what this service calls a client; `None` keeps `client`/`clients`.
    pub vocabulary: Option<crate::shell::dashboard::Vocabulary>,
    /// kit-r4: the service's own article before the singular, when the
    /// vowel-sound rule is wrong for its word. Not public: set through
    /// `App::vocabulary_article`.
    pub(crate) vocabulary_article: Option<String>,
    /// K29: the project's buttons on every active client row.
    pub client_actions: Vec<crate::shell::dashboard::ClientAction>,
}

/// A started service: its address and the handle to stop it.
pub struct Running {
    pub addr: SocketAddr,
    stop: oneshot::Sender<()>,
    shutdown: crate::shell::shutdown::ShutdownTrigger,
    task: tokio::task::JoinHandle<()>,
    shutdown_timeout: Duration,
    flushes: Vec<Box<dyn FnOnce() + Send>>,
    #[cfg(unix)]
    backup: Option<crate::shell::backup::server::Server>,
    /// 3.11.0: the budget check and the daily removal of finished rows.
    #[cfg(feature = "storage")]
    storage_tasks: Vec<tokio::task::JoinHandle<()>>,
}
