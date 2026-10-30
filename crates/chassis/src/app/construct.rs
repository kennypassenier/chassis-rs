//! Building an `App`: from the real command line or from an explicit one,
//! parsing and validating configuration on the way. Nothing here opens a
//! socket or touches the state directory.

use std::collections::{BTreeMap, HashSet};
use std::net::SocketAddr;
use std::time::Duration;

use axum::Router;

mod listen;
use listen::parse_listen;

#[cfg(feature = "dashboard")]
use super::DashboardRegistry;
use super::{App, AppSpec, Control, Limits, cli};
use crate::core::error::Error;
use crate::shell::config_load::Loaded;
use crate::shell::lifecycle;
use crate::shell::logging::LogFormat;

/// What differs between an app that read configuration and one that did
/// not (`--version`, `--knobs`, `gen-secret`, the backup commands).
struct Core {
    loaded: Option<Loaded>,
    listen: SocketAddr,
    shutdown_timeout: Duration,
    limits: Limits,
    control: Option<Control>,
}

impl App {
    /// An app that answers one control command without reading any
    /// configuration; every field but the command is a placeholder.
    pub(super) fn bare(spec: AppSpec, router: Router, control: Control) -> App {
        #[cfg(feature = "notify")]
        let notify = (
            crate::shell::notify::Notifier::logging_only(spec.name),
            None,
        );
        let core = Core {
            loaded: None,
            listen: "0.0.0.0:0".parse().expect("literal"),
            shutdown_timeout: Duration::from_secs(1),
            limits: Limits::placeholder(),
            control: Some(control),
        };
        App::assemble(
            spec,
            router,
            core,
            #[cfg(feature = "notify")]
            notify,
        )
    }

    /// The one place an `App` is written out in full: every registry empty,
    /// every hook unset.
    fn assemble(
        spec: AppSpec,
        router: Router,
        core: Core,
        #[cfg(feature = "notify")] notify: (
            crate::shell::notify::Notifier,
            Option<crate::shell::notify::Drain>,
        ),
    ) -> App {
        App {
            spec,
            loaded: core.loaded,
            listen: core.listen,
            shutdown_timeout: core.shutdown_timeout,
            limits: core.limits,
            control: core.control,
            router,
            api_router: Router::new(),
            dashboard_router: Router::new(),
            #[cfg(feature = "webapp")]
            webapp: None,
            checks: Vec::new(),
            flush: None,
            start_hooks: Vec::new(),
            backup_cmd: None,
            backup_pause_hooks: Vec::new(),
            backup_resume_hooks: Vec::new(),
            backup_mode: crate::shell::backup::Mode::Writes,
            backup_paths: Vec::new(),
            #[cfg(feature = "storage")]
            dbs: Vec::new(),
            #[cfg(feature = "storage")]
            app_db: None,
            #[cfg(feature = "storage")]
            storage_kinds: Vec::new(),
            #[cfg(feature = "storage")]
            storage_budget: None,
            #[cfg(feature = "storage")]
            storage_warn_hook: None,
            #[cfg(feature = "dashboard")]
            browser_keys: None,
            #[cfg(feature = "dashboard")]
            prefs_store: None,
            #[cfg(feature = "dashboard")]
            pages: Vec::new(),
            #[cfg(feature = "dashboard")]
            kit_page_edits: Vec::new(),
            #[cfg(feature = "dashboard")]
            brand: None,
            #[cfg(feature = "dashboard")]
            brand_title: None,
            #[cfg(feature = "dashboard")]
            disabled_kit_pages: Vec::new(),
            #[cfg(feature = "dashboard")]
            home: None,
            #[cfg(feature = "dashboard")]
            kit_pages_in_webapp: false,
            subsystems: Vec::new(),
            scrape_sources: Vec::new(),
            timeout_exempt: HashSet::new(),
            #[cfg(feature = "request-guard")]
            request_guards: Vec::new(),
            #[cfg(feature = "request-guard")]
            request_guard_exempt: Vec::new(),
            #[cfg(feature = "dashboard")]
            test_route: None,
            #[cfg(feature = "dashboard")]
            client_store: None,
            #[cfg(feature = "dashboard")]
            dash: DashboardRegistry::default(),
            #[cfg(feature = "self-update")]
            state_copy: None,
            #[cfg(feature = "self-update")]
            update_gate: None,
            #[cfg(feature = "self-update")]
            update_hook: None,
            #[cfg(feature = "notify")]
            notifier: notify.0,
            #[cfg(feature = "notify")]
            notify_drain: notify.1,
            #[cfg(feature = "notify")]
            notify_code_targets: None,
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
        let knobs = spec.knobs();
        let matches = match cli::command(&spec, &knobs).try_get_matches_from(args) {
            Ok(matches) => matches,
            // 1.2.0: `--help` is an answer on stdout with exit 0, not a
            // refusal — scripts and humans tell the two apart by exit code.
            Err(e) if e.kind() == clap::error::ErrorKind::DisplayHelp => {
                return Ok(App::bare(spec, router, Control::Help(e.to_string())));
            }
            Err(e) => {
                return Err(Error::invalid(
                    e.to_string().trim_end().to_string(),
                    "run with --help for the flags this service accepts",
                ));
            }
        };
        if let Some(control) = cli::early_control(&matches) {
            return Ok(App::bare(spec, router, control));
        }
        if let Some(cmd) = cli::backup_command(&matches) {
            let mut app = App::bare(spec, router, Control::Version);
            app.control = None;
            app.backup_cmd = Some(cmd);
            return Ok(app);
        }

        let loaded = crate::shell::config_load::load_with_env(
            &spec.prefix(),
            &knobs,
            cli::knob_flags(&matches, &knobs),
            &spec.state_dir_default(),
            env.clone(),
        )?;
        let control = cli::requested_control(&matches);
        let listen = parse_listen(&spec, &loaded)?;
        let shutdown_timeout = lifecycle::parse_shutdown_timeout(
            loaded.get("shutdown_timeout_ms").unwrap_or("10000"),
        )?;
        // Validated here so --check catches a bad value; the subscriber is
        // installed in start() so control commands stay silent on stderr.
        LogFormat::parse(loaded.get("log_format").unwrap_or("text"))?;
        let limits = Limits::parse(&loaded)?;
        limits.validate(&spec, &loaded)?;
        #[cfg(feature = "notify")]
        let notify = super::notify::prepare_notifier(&spec, &loaded, &env, &limits)?;
        super::validate::validate_login_config(&spec, &loaded, &limits)?;

        let core = Core {
            loaded: Some(loaded),
            listen,
            shutdown_timeout,
            limits,
            control,
        };
        Ok(App::assemble(
            spec,
            router,
            core,
            #[cfg(feature = "notify")]
            notify,
        ))
    }
}
