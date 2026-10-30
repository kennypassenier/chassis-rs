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

use std::collections::{BTreeMap, HashSet};
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use tokio::sync::oneshot;

use crate::core::config::Knob;
use crate::core::error::Error;
use crate::shell::config_load::Loaded;
use crate::shell::health::Subsystem;
use crate::shell::lifecycle;
use crate::shell::metrics::ScrapeSource;
#[cfg(feature = "dashboard")]
use crate::shell::store::ClientStore;

mod cli;
mod construct;
mod control;
mod knobs;
mod limits;
#[cfg(feature = "notify")]
mod notify;
mod rekey;
mod run;
#[cfg(feature = "self-update")]
mod self_update;
mod start;
#[cfg(feature = "storage")]
mod storage_open;
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
impl AppSpec {
    /// `INBOX` for `inbox`; dashes become underscores.
    pub fn prefix(&self) -> String {
        self.name.to_ascii_uppercase().replace('-', "_")
    }

    /// `inbox` for `inbox`; dashes become underscores (Prometheus names).
    pub fn metric_prefix(&self) -> String {
        self.name.to_ascii_lowercase().replace('-', "_")
    }

    /// The config-file keys the kit owns (1.1.0): a project that parses the
    /// same file with `deny_unknown_fields` strips these first.
    pub fn knob_keys(&self) -> Vec<&'static str> {
        self.knobs().into_iter().map(|k| k.key).collect()
    }

    /// The config-file TABLE sections the kit owns (feat-config-1), next to
    /// the knob keys because the two are stripped together.
    ///
    /// A section cannot be derived from `knob_keys()`: a knob is one flat
    /// scalar key, while a section is a table or an array of tables
    /// (`[[notify.webhook]]`) that the kit parses with its own serde types
    /// and never registers as a knob. Whatever is missing here lands in the
    /// project's half of the file and makes its `deny_unknown_fields` parse
    /// fail on a machine, after an upgrade — so a milestone that teaches the
    /// kit a new section adds its name here in the same commit.
    ///
    /// Complete whatever the binary was compiled with, like `knob_keys()`: a
    /// section of an absent feature is still accepted and ignored.
    pub fn kit_sections(&self) -> &'static [&'static str] {
        &["notify"]
    }

    fn state_dir_default(&self) -> PathBuf {
        self.default_state_dir
            .clone()
            .unwrap_or_else(|| PathBuf::from("/var/lib").join(self.name))
    }

    /// The kit's own knobs (AR3), in milestone order: listening and
    /// logging first, then the guards, the dashboard, self-update and the
    /// notifier. Milestones add rows here; `docs/CONFIGURATION.md` points
    /// at `--knobs` instead of repeating the list (K31).
    pub fn knobs(&self) -> Vec<Knob> {
        knobs::rows(self.default_listen)
    }

    /// The knob table as Markdown (K31) for the features this binary was
    /// built with (K36): one row per knob in `knobs()` order, with the
    /// three names, the default (`—` when there is none, `(secret)` for the
    /// two secrets, whose value never appears anywhere), the feature that
    /// reads it and its one-sentence meaning. Printed by `--knobs`.
    pub fn knobs_markdown(&self) -> String {
        self.knobs_markdown_for(compiled_features())
    }

    /// [`AppSpec::knobs_markdown`] for a named set of features instead of
    /// this binary's own (K36). `chassis sync` renders `docs/KIT.md` from
    /// outside the service, so it passes the feature list it read from the
    /// project's `Cargo.toml`; the `chassis` command's own features are
    /// those of a scaffold tool and say nothing about the project.
    ///
    /// A knob whose `feature` is `None` is core and always listed. Note
    /// that this filters the DOCUMENT, not [`AppSpec::knobs`] or
    /// [`AppSpec::knob_keys`]: a knob of a feature the binary lacks is
    /// still accepted and ignored in the config file, which is what
    /// `docs/KIT.md` promises.
    pub fn knobs_markdown_for<S: AsRef<str>>(&self, features: &[S]) -> String {
        knobs::markdown(self, features)
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
    api_router: Router,
    dashboard_router: Router,
    /// feat-webapp-1: the project's own browser app, if it registered one.
    #[cfg(feature = "webapp")]
    webapp: Option<crate::shell::webapp::WebApp>,
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
    task: tokio::task::JoinHandle<()>,
    shutdown_timeout: Duration,
    flushes: Vec<Box<dyn FnOnce() + Send>>,
    #[cfg(unix)]
    backup: Option<crate::shell::backup::server::Server>,
    /// 3.11.0: the budget check and the daily removal of finished rows.
    #[cfg(feature = "storage")]
    storage_tasks: Vec<tokio::task::JoinHandle<()>>,
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
        Self::parse(spec, args, env, router)
    }

    /// The handle to send the project's own events through (K22). Valid
    /// right after `from_args`; delivery starts with `start`.
    #[cfg(feature = "notify")]
    pub fn notifier(&self) -> crate::shell::notify::Notifier {
        self.notifier.clone()
    }

    /// Say "not now" to the autonomous update loop (1.2.0). The closure
    /// runs before every check; `Some(reason)` defers that check to the
    /// next interval and logs the reason. For a service that must not
    /// restart while an investigation is in progress (Almanac's captures,
    /// a long-running import). Supervised updates (`<name> update`) are
    /// the operator's decision and are not gated.
    #[cfg(feature = "self-update")]
    pub fn update_gate(
        &mut self,
        f: impl Fn() -> Option<String> + Send + Sync + 'static,
    ) -> &mut Self {
        self.update_gate = Some(Arc::new(f));
        self
    }

    /// Listen to the update events (1.3.0): `update.installed`, `update.ok`,
    /// `update.failed`, `update.rolled_back`, `update.held`, whichever loop
    /// or subcommand produced them. The kit still handles the event itself
    /// (the `notify` feature's webhooks, or a log line); the hook runs
    /// alongside, so a project can speak its own vocabulary to its own
    /// notifier — Almanac's `almanac-update` / `-reverted` / `-unverified`.
    #[cfg(feature = "self-update")]
    pub fn on_update_event(
        &mut self,
        f: impl Fn(&crate::shell::update::Event) + Send + Sync + 'static,
    ) -> &mut Self {
        self.update_hook = Some(Arc::new(f));
        self
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
    /// [`WebApp::at`]: crate::shell::webapp::WebApp::at
    #[cfg(feature = "webapp")]
    pub fn webapp(&mut self, app: crate::shell::webapp::WebApp) -> &mut Self {
        self.webapp = Some(app);
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

    /// feat-pages-1: a page of the project, in the one list every
    /// navigation renders from (the kit's layout and, through
    /// `GET /api/kit/pages`, a web app). `Page::new(id, title, path)`,
    /// then `.order(n)`, `.group(g)`, `.hidden()` (routable, not listed).
    #[cfg(feature = "dashboard")]
    pub fn page(&mut self, page: crate::shell::pages::Page) -> &mut Self {
        self.pages.push(page);
        self
    }

    /// feat-pages-1: change one of the kit's pages (`status`, `clients`,
    /// `passkeys`): its title, order, group or whether it is listed. Its id
    /// and path stay the kit's.
    #[cfg(feature = "dashboard")]
    pub fn kit_page(
        &mut self,
        id: &str,
        edit: impl Fn(crate::shell::pages::Page) -> crate::shell::pages::Page + Send + Sync + 'static,
    ) -> &mut Self {
        self.kit_page_edits.push((id.to_string(), Box::new(edit)));
        self
    }

    /// feat-pages-1: where the brand link on the left of the navigation
    /// goes (default `/`).
    #[cfg(feature = "dashboard")]
    pub fn brand(&mut self, href: &str) -> &mut Self {
        self.brand = Some(href.to_string());
        self
    }

    /// The brand link's text (default: `AppSpec::name`, the binary's name),
    /// so a service called `homelab-admin` can show "Homelab". Used by the
    /// kit's layout and served in `/api/kit/pages` as `brand.title`.
    #[cfg(feature = "dashboard")]
    pub fn brand_title(&mut self, title: &str) -> &mut Self {
        self.brand_title = Some(title.to_string());
        self
    }

    /// feat-pages-1: where `/` leads when no web app sits at the root
    /// (default: the status page, served at `/` itself).
    #[cfg(feature = "dashboard")]
    pub fn home(&mut self, path: &str) -> &mut Self {
        self.home = Some(path.to_string());
        self
    }

    /// Kenny, 2026-10-02: switch one of the kit's pages off for this
    /// service (`status`, `clients`, `passkeys`): no route, no data
    /// endpoint, no navigation entry. `clients` also takes the client
    /// management API with it; `passkeys` the passkey ceremonies and the
    /// login page's passkey button. Every page is on unless switched off.
    #[cfg(feature = "dashboard")]
    pub fn disable_kit_page(&mut self, id: &str) -> &mut Self {
        self.disabled_kit_pages.push(id.to_string());
        self
    }

    /// feat-pages-1: the project's web app draws the kit's pages too, from
    /// `/api/kit/status`, `/api/kit/clients`, `/api/kit/passkeys` and
    /// `/api/kit/storage`, so every page carries the app's own bar. The kit
    /// then claims no GET page at `/status`, `/clients`, `/passkeys` or
    /// `/storage`; its actions stay.
    /// Needs a web app at the root.
    #[cfg(feature = "dashboard")]
    pub fn kit_pages_in_webapp(&mut self) -> &mut Self {
        self.kit_pages_in_webapp = true;
        self
    }

    /// feat-backup-1: one more directory a backup pause holds still and
    /// `backup-pause` lists, beside the state root (data the project keeps
    /// elsewhere).
    pub fn backup_path(&mut self, path: impl Into<PathBuf>) -> &mut Self {
        self.backup_paths.push(path.into());
        self
    }

    /// 3.11.0: put a sqlite database the project opened itself
    /// ([`crate::storage::Db::open`]) under the backup pause and the
    /// pre-update copy. The pause checkpoints its log once the writes
    /// drained (a busy checkpoint falls back to stopping the unit), the copy
    /// snapshots it with `VACUUM INTO`, and its directory joins the paths
    /// `backup-pause` lists when it lies outside the state root. The kit's
    /// own files and [`App::app_db`] are registered by themselves.
    #[cfg(feature = "storage")]
    pub fn backup_db(&mut self, db: &crate::storage::Db) -> &mut Self {
        self.dbs.push(db.clone());
        self
    }

    /// 3.11.0: the app's own database, `<state_dir>/<name>.db`. Returns a
    /// handle at once; the file opens at start, so `--check` and
    /// `--version` create nothing. The migrations are a numbered list, each
    /// atomic; a database newer than this build is refused. The optional
    /// import runs once in one transaction (see
    /// [`crate::storage::AppDbSpec`]). The file is under the backup pause,
    /// the pre-update copy and the storage budget without further ado.
    /// Call it once.
    #[cfg(feature = "storage")]
    pub fn app_db(
        &mut self,
        spec: crate::storage::AppDbSpec,
    ) -> Result<crate::storage::AppDb, Error> {
        if self.app_db.is_some() {
            return Err(Error::config(
                "App::app_db was called twice",
                "a service has one app database; keep the handle the first call returned",
            ));
        }
        let handle = crate::storage::AppDb::unopened()?;
        self.app_db = Some((handle.clone(), spec));
        Ok(handle)
    }

    /// 3.11.0: declare a kind of data in the app database, for the Storage
    /// page and the daily removal of rows finished by their own
    /// definition. Validated against the schema at start.
    #[cfg(feature = "storage")]
    pub fn storage_kind(&mut self, kind: crate::storage::DataKind) -> &mut Self {
        self.storage_kinds.push(kind);
        self
    }

    /// 3.11.0: the storage budget in megabytes (default 50) and the line at
    /// which it starts to warn (default 80 % of the budget, 40 of 50). A
    /// `<P>_STORAGE_BUDGET_MB` / `<P>_STORAGE_WARN_MB` setting wins. The
    /// budget only ever warns; a write is never refused for size.
    #[cfg(feature = "storage")]
    pub fn storage_budget(&mut self, budget_mb: u64, warn_mb: Option<u64>) -> &mut Self {
        self.storage_budget = Some((budget_mb, warn_mb));
        self
    }

    /// 3.15.0: the app's default notification addresses: the primary target
    /// (a kyu topic) and an optional fallback. They sit below configuration
    /// and below what the owner saved on the Status page, and above the
    /// kit's default of no target. Keep a webhook id out of code: give the
    /// fallback through `<P>_NOTIFY_FALLBACK_URL` instead.
    #[cfg(feature = "notify")]
    pub fn notify_targets(&mut self, primary: &str, fallback: Option<&str>) -> &mut Self {
        self.notify_code_targets = Some((primary.to_string(), fallback.map(str::to_string)));
        self
    }

    /// 3.11.0: run once when the storage files rise past the warn line (and
    /// again past the budget), with the report the Storage page shows.
    #[cfg(feature = "storage")]
    pub fn on_storage_warn(
        &mut self,
        f: impl Fn(&crate::storage::StorageReport) + Send + Sync + 'static,
    ) -> &mut Self {
        self.storage_warn_hook = Some(Arc::new(f));
        self
    }

    /// 3.12.0: sync these `localStorage` keys of the browser to the app
    /// database, per login, so a person's preferences follow them across
    /// devices. Only the declared keys sync, and **a secret must never be
    /// declared**: values are plain text in the database and in the page. The
    /// declaration also refuses names that look like secrets. Needs
    /// [`App::app_db`] (the preferences are a table of it) unless a store is
    /// given with [`App::prefs_store`]. See `docs/DASHBOARD.md`.
    #[cfg(feature = "dashboard")]
    pub fn sync_browser_keys(&mut self, keys: crate::storage::BrowserKeys) -> &mut Self {
        self.browser_keys = Some(keys);
        self
    }

    /// 3.12.0: keep the synced preferences in a store of the project's own
    /// (another adapter of [`crate::storage::PrefStore`]) instead of the
    /// app database. The Storage page then lists no Preferences kind.
    #[cfg(feature = "dashboard")]
    pub fn prefs_store(&mut self, store: Arc<dyn crate::storage::PrefStore>) -> &mut Self {
        self.prefs_store = Some(store);
        self
    }

    /// A link in the dashboard's top navigation (K16): since 3.1.0 a
    /// visible project page in the page registry.
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

    /// An extra field on the issue form of the clients page (K16, 1.7.0):
    /// what a client of this service needs besides a name. The values
    /// reach `on_client_issued`.
    #[cfg(feature = "dashboard")]
    pub fn client_form_field(
        &mut self,
        field: crate::shell::dashboard::ClientFormField,
    ) -> &mut Self {
        self.dash.form_fields.push(field);
        self
    }

    /// Runs before a client token is issued (K16, 1.7.0) with the
    /// client-to-be and the extra form fields; an `Err` refuses the
    /// issue and reaches the page as the kit's error with remedy.
    #[cfg(feature = "dashboard")]
    pub fn on_client_issued(
        &mut self,
        f: impl Fn(
            &crate::shell::clients_api::ClientView,
            &std::collections::BTreeMap<String, String>,
        ) -> Result<(), Error>
        + Send
        + Sync
        + 'static,
    ) -> &mut Self {
        self.dash.on_client_issued = Some(Arc::new(f));
        self
    }

    /// Runs before a client is deleted (K16, 1.7.0): the project removes
    /// what it created alongside, or returns an `Error` and nothing is
    /// deleted — the page shows the error with its remedy.
    #[cfg(feature = "dashboard")]
    pub fn on_client_deleted(
        &mut self,
        f: impl Fn(&crate::shell::clients_api::ClientView) -> Result<(), Error> + Send + Sync + 'static,
    ) -> &mut Self {
        self.dash.on_client_deleted = Some(Arc::new(f));
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
    /// Almanac); code and URL stay `clients` (E1). Without it the heading
    /// and nav label are the vocabulary's capitalised plural.
    #[cfg(feature = "dashboard")]
    pub fn clients_label(&mut self, label: &str) -> &mut Self {
        self.dash.clients_label = Some(label.to_string());
        self
    }

    /// What this service calls a client (K28), lower case: Almanac says
    /// `vocabulary("source", "sources")`. Every kit sentence and every
    /// clients-API message then uses that word; URLs, JSON keys, cookies,
    /// metrics and log fields keep saying `client`.
    #[cfg(feature = "dashboard")]
    pub fn vocabulary(&mut self, singular: &str, plural: &str) -> &mut Self {
        self.dash.vocabulary = Some(crate::shell::dashboard::Vocabulary::new(singular, plural));
        self
    }

    /// The article before the singular word, when the vowel-sound rule gets
    /// it wrong (kit-r4). By default the kit writes "an app", "a source",
    /// "an inbox" from the word's sound; a word the rule cannot know (an
    /// acronym such as `sms`, said "an es-em-ess") is set here:
    /// `vocabulary_article("an")`.
    #[cfg(feature = "dashboard")]
    pub fn vocabulary_article(&mut self, article: &str) -> &mut Self {
        self.dash.vocabulary_article = Some(article.trim().to_string());
        self
    }

    /// A button on every active client row (K29): `{id}` in the route is
    /// the client's id; the route is the project's own, registered with
    /// `dashboard_routes`. Several may be registered; they render in this
    /// order.
    #[cfg(feature = "dashboard")]
    pub fn client_action(&mut self, action: crate::shell::dashboard::ClientAction) -> &mut Self {
        self.dash.client_actions.push(action);
        self
    }

    /// The project's own half of the shared config file, as a TOML table
    /// (feat-config-1): every kit knob key and every kit-owned section
    /// stripped. An error only when this invocation reads no configuration
    /// at all — guard with [`App::needs_project_config`].
    pub fn project_table(&self) -> Result<toml::Table, Error> {
        Ok(self.loaded_for_project()?.project_table(&self.spec))
    }

    /// The project's own half of the shared config file, deserialised into
    /// the project's own type (feat-config-1). The whole call site, for a
    /// struct with `deny_unknown_fields`:
    ///
    /// ```ignore
    /// let config: Config = app.project_config()?;
    /// ```
    pub fn project_config<T: serde::de::DeserializeOwned>(&self) -> Result<T, Error> {
        self.loaded_for_project()?.project_config(&self.spec)
    }

    fn loaded_for_project(&self) -> Result<&Loaded, Error> {
        self.loaded.as_ref().ok_or_else(|| {
            Error::internal(
                "this invocation reads no configuration, so the project's own settings are not available",
                "ask for the project's configuration only when needs_project_config() is true",
            )
        })
    }

    /// Whether this invocation is going to read the project's own
    /// configuration (1.2.0): a real start or `--check`. `--version`,
    /// `--help`, `--knobs`, `gen-secret`, `--healthcheck`, `--print-config`,
    /// `update` and `rekey` are the kit's alone and must work without it — two
    /// projects got this wrong the same afternoon and broke their
    /// `--healthcheck` on a box without a config file.
    pub fn needs_project_config(&self) -> bool {
        self.loaded.is_some() && matches!(self.control, None | Some(Control::Check))
    }

    /// A project check that `--check` (and the self-update's staged probe)
    /// runs after the kit's own validation. It must not write: the probe
    /// runs against the live store while the old version still serves.
    /// That includes opening the store: open it read-only here, never through
    /// the path that migrates. kyu 3.3.0 opened it the migrating way, and the
    /// probe, run as root on CT 109, applied a migration and left a
    /// root-owned `kyu.pre-v4.db` behind (kyu fix-check-1, 2026-09-20).
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

    /// Run after the socket is bound and readiness was announced, inside
    /// the runtime, on the serving path only: spawn background workers
    /// here (a pump, a poller). `--check` and the other control commands
    /// never reach it; pair it with `on_flush` to stop the workers.
    /// feat-backup-1: the least a backup pause of this service holds.
    /// `Writes` (the default) lets reads and pages answer; `Full` also
    /// answers every request but the probes 503 and tells the pause hooks
    /// to stop background work. A caller may ask for more, never less.
    pub fn backup_mode(&mut self, mode: crate::shell::backup::Mode) -> &mut Self {
        self.backup_mode = mode;
        self
    }

    /// feat-backup-1: run when a backup pause starts, after every write of
    /// the kit's state and every [`crate::shell::backup::writing`] ticket
    /// came back, before the pause is confirmed to the caller, with the
    /// mode in force. The place to bring a project's own files to rest (a
    /// SQLite `wal_checkpoint(TRUNCATE)`) and, under `Full`, to stop its
    /// pumps and pollers. An error refuses the in-process pause and the
    /// backup stops the unit instead. Must not write through the kit's
    /// stores: they are held.
    pub fn on_backup_pause(
        &mut self,
        f: impl Fn(crate::shell::backup::Mode) -> Result<(), Error> + Send + Sync + 'static,
    ) -> &mut Self {
        self.backup_pause_hooks.push(Arc::new(f));
        self
    }

    /// feat-backup-1: run when a backup pause ends, whatever ended it
    /// (`backup-resume`, the deadline, a refused pause, shutdown).
    pub fn on_backup_resume(&mut self, f: impl Fn() + Send + Sync + 'static) -> &mut Self {
        self.backup_resume_hooks.push(Arc::new(f));
        self
    }

    pub fn on_start(&mut self, f: impl FnOnce() + Send + 'static) -> &mut Self {
        self.start_hooks.push(Box::new(f));
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

    /// feat-guard-1: run `guard` before every route the service serves, the
    /// kit's own included (`/login`, `/static`, `/api`, the web app), after
    /// the proxy handling and before any login. `Ok(())` lets the request
    /// through; `Err(response)` is sent as it is. Guards run in registration
    /// order and the first refusal wins. `/healthz` is always exempt; see
    /// [`App::request_guard_exempt`] for more. A header a proxy sets
    /// (`Cf-Connecting-IP`, `Cf-Access-Jwt-Assertion`) is only worth reading
    /// when [`GuardRequest::from_trusted_proxy`] is true.
    ///
    /// [`GuardRequest::from_trusted_proxy`]: crate::shell::request_guard::GuardRequest::from_trusted_proxy
    #[cfg(feature = "request-guard")]
    pub fn request_guard<F, Fut>(&mut self, guard: F) -> &mut Self
    where
        F: Fn(crate::shell::request_guard::GuardRequest) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<(), axum::response::Response>> + Send + 'static,
    {
        let guard = Arc::new(guard);
        self.request_guards.push(Arc::new(move |r| {
            let guard = guard.clone();
            Box::pin(async move { guard(r).await })
        }));
        self
    }

    /// feat-guard-1: paths under this prefix skip the request guards (a
    /// whole segment: `/metrics` covers `/metrics` and `/metrics/x`, not
    /// `/metricsx`). `/healthz` is exempt without asking.
    #[cfg(feature = "request-guard")]
    pub fn request_guard_exempt(&mut self, path_prefix: impl Into<String>) -> &mut Self {
        self.request_guard_exempt.push(path_prefix.into());
        self
    }

    /// Paths under this prefix are not subject to the request timeout
    /// (long polls, streaming).
    pub fn exempt_from_timeout(&mut self, path_prefix: impl Into<String>) -> &mut Self {
        self.timeout_exempt.insert(path_prefix.into());
        self
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
        self.answer_control().await
    }

    /// Control command or full lifecycle; errors are printed with their
    /// remedy and turn into exit 1.
    #[allow(unused_mut)]
    pub async fn run(mut self) -> ExitCode {
        self.run_lifecycle().await
    }

    /// Install logging and metrics, bind, announce readiness, serve.
    #[allow(unused_mut)]
    pub async fn start(mut self) -> Result<Running, Error> {
        self.start_server().await
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
            #[cfg(unix)]
            backup,
            #[cfg(feature = "storage")]
            storage_tasks,
            ..
        } = self;
        #[cfg(feature = "storage")]
        for t in &storage_tasks {
            t.abort();
        }
        // A held write would outlast the drain; end any backup pause first.
        #[cfg(unix)]
        if let Some(backup) = backup {
            backup.stop().await;
        }
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
