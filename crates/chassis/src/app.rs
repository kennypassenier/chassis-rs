//! The one type a service talks to (AR2): describe yourself, hand over
//! your routes and hooks, run.
//!
//! ```text
//! let spec = chassis::AppSpec { name: "inbox", version: env!("CARGO_PKG_VERSION"), ..Default::default() };
//! let mut app = chassis::App::from_env_and_args(spec, my_router)?;
//! app.on_check(|| my_store.verify());     // runs under --check, never writes
//! app.on_flush(|| my_store.checkpoint()); // runs after the server drained
//! app.run().await                          // ExitCode
//! ```
//!
//! `run` does everything AR15 lists: answer the control commands
//! (`--version`, `--check`, `--print-config`) without opening a socket,
//! start logging, bind, tell systemd we are ready, serve, and stop
//! cleanly on SIGTERM. Control commands are dispatched in `run`, not in
//! `from_args`, so a project's own check hook is registered by the time
//! `--check` runs (the critic's objection #8). `--version` is the
//! exception: it is answered before configuration is even read (AR20).

use std::collections::BTreeMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Duration;

use axum::Router;
use clap::{Arg, ArgAction, Command};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

use crate::core::config::{Knob, render_table};
use crate::core::error::Error;
use crate::shell::config_load::{Loaded, load};
use crate::shell::http::with_kit_layers;
use crate::shell::lifecycle;
use crate::shell::logging::{self, LogFormat};

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

    fn state_dir_default(&self) -> PathBuf {
        self.default_state_dir
            .clone()
            .unwrap_or_else(|| PathBuf::from("/var/lib").join(self.name))
    }

    /// The kit's own knobs (AR3). Milestones add rows here; a doc test
    /// compares this list with the AR3 table.
    pub fn knobs(&self) -> Vec<Knob> {
        vec![
            Knob {
                key: "listen",
                default: Some(self.default_listen),
                secret: false,
            },
            Knob {
                key: "state_dir",
                default: None,
                secret: false,
            },
            Knob {
                key: "config",
                default: None,
                secret: false,
            },
            Knob {
                key: "log",
                default: Some("info"),
                secret: false,
            },
            Knob {
                key: "log_format",
                default: Some("text"),
                secret: false,
            },
            Knob {
                key: "shutdown_timeout_ms",
                default: Some("10000"),
                secret: false,
            },
        ]
    }
}

/// A control command the command line asked for; answered by `run`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Control {
    Version,
    Check,
    PrintConfig,
}

type Hook = Box<dyn FnOnce() -> Result<(), Error> + Send>;

/// A configured, not yet started service.
pub struct App {
    pub spec: AppSpec,
    /// `None` only for `--version`, which never reads configuration.
    pub loaded: Option<Loaded>,
    pub listen: SocketAddr,
    pub shutdown_timeout: Duration,
    pub control: Option<Control>,
    router: Router,
    checks: Vec<Hook>,
    flush: Option<Box<dyn FnOnce() + Send>>,
}

/// A started service: its address and the handle to stop it.
pub struct Running {
    pub addr: SocketAddr,
    stop: oneshot::Sender<()>,
    task: tokio::task::JoinHandle<()>,
    shutdown_timeout: Duration,
    flush: Option<Box<dyn FnOnce() + Send>>,
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
        let knobs = spec.knobs();
        let mut cmd = Command::new(spec.name.to_string())
            .version(spec.version)
            .disable_version_flag(true)
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
            return Ok(App {
                spec,
                loaded: None,
                listen: "0.0.0.0:0".parse().expect("literal"),
                shutdown_timeout: Duration::from_secs(1),
                control: Some(Control::Version),
                router,
                checks: Vec::new(),
                flush: None,
            });
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
            None
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

        Ok(App {
            spec,
            loaded: Some(loaded),
            listen,
            shutdown_timeout,
            control,
            router,
            checks: Vec::new(),
            flush: None,
        })
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

    /// Answer the control command, if any. `Some(code)` means "exit now".
    pub fn control(&mut self) -> Result<Option<ExitCode>, Error> {
        match self.control {
            None => Ok(None),
            Some(Control::Version) => {
                println!("{} {}", self.spec.name, self.spec.version);
                Ok(Some(ExitCode::SUCCESS))
            }
            Some(Control::PrintConfig) => {
                let loaded = self.loaded.as_ref().expect("loaded for print-config");
                print!("{}", render_table(&loaded.resolved));
                Ok(Some(ExitCode::SUCCESS))
            }
            Some(Control::Check) => {
                for check in self.checks.drain(..) {
                    check()?;
                }
                println!("{}: configuration ok", self.spec.name);
                Ok(Some(ExitCode::SUCCESS))
            }
        }
    }

    /// Control command or full lifecycle; errors are printed with their
    /// remedy and turn into exit 1.
    pub async fn run(mut self) -> ExitCode {
        match self.control() {
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

    /// Install logging, bind, announce readiness, serve in a task.
    pub async fn start(self) -> Result<Running, Error> {
        let loaded = self.loaded.as_ref().ok_or_else(|| {
            Error::internal("start() called on a --version app", "call run() instead")
        })?;
        let filter = loaded.get("log").unwrap_or("info").to_string();
        let format = LogFormat::parse(loaded.get("log_format").unwrap_or("text"))?;
        logging::init(&filter, format)?;

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

        let (stop_tx, stop_rx) = oneshot::channel::<()>();
        let router = with_kit_layers(self.router);
        let task = tokio::spawn(async move {
            let serve = axum::serve(listener, router).with_graceful_shutdown(async {
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
            flush: self.flush,
        })
    }
}

impl Running {
    /// Drain in-flight requests and run the flush hook, bounded by the
    /// shutdown timeout. Always returns; the caller exits 0 (N1).
    pub async fn stop(self) {
        let Running {
            stop,
            task,
            shutdown_timeout,
            flush,
            ..
        } = self;
        let _ = stop.send(());
        let drained = lifecycle::bounded(shutdown_timeout, "in-flight requests", async {
            let _ = task.await;
        })
        .await;
        if let Some(f) = flush {
            let done = tokio::task::spawn_blocking(f);
            lifecycle::bounded(shutdown_timeout, "the flush hook", async {
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

    #[test]
    fn version_flag_reads_no_configuration() {
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
        assert_eq!(app.control().unwrap(), Some(ExitCode::SUCCESS));
    }

    #[test]
    fn unknown_flag_is_refused_with_remedy() {
        let err = App::from_args(spec(), argv(&["--bogus"]), Router::new())
            .err()
            .expect("an unknown flag is an error");
        assert!(err.remedy.contains("--help"));
    }

    #[test]
    fn check_runs_project_hooks_and_reports_their_remedy() {
        let dir = tempfile::tempdir().unwrap();
        let mut app = App::from_args(
            spec(),
            argv(&[
                "--check",
                "--state-dir",
                dir.path().to_str().unwrap(),
                "--listen",
                "127.0.0.1:0",
            ]),
            Router::new(),
        )
        .unwrap();
        app.on_check(|| {
            Err(Error::config(
                "store is from the future",
                "downgrade is not possible; restore the pre-update copy",
            ))
        });
        let err = app.control().unwrap_err();
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

    #[tokio::test]
    async fn start_binds_port_zero_and_stops_cleanly() {
        let dir = tempfile::tempdir().unwrap();
        let mut app = App::from_args(
            spec(),
            argv(&[
                "--state-dir",
                dir.path().to_str().unwrap(),
                "--listen",
                "127.0.0.1:0",
                "--shutdown-timeout-ms",
                "2000",
            ]),
            Router::new().route("/", get(|| async { "hi" })),
        )
        .unwrap();
        assert!(app.control.is_none());
        let flushed = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let f2 = flushed.clone();
        app.on_flush(move || f2.store(true, std::sync::atomic::Ordering::SeqCst));
        let running = app.start().await.unwrap();
        assert_ne!(running.addr.port(), 0);
        let body = reqwest::get(format!("http://{}/", running.addr))
            .await
            .unwrap()
            .text()
            .await
            .unwrap();
        assert_eq!(body, "hi");
        running.stop().await;
        assert!(
            flushed.load(std::sync::atomic::Ordering::SeqCst),
            "flush hook ran after drain"
        );
    }
}
