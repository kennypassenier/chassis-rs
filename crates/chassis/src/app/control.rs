//! The control commands `App::control` answers without opening a socket
//! (`--version`, `--help`, `--check`, `--print-config`, `--knobs`,
//! `--healthcheck`, `gen-secret`, `update`, `rekey`). Control commands are
//! dispatched in `run`, not in `from_args`, so a project's hooks are
//! registered by the time `--check` runs (the critic's objection #8).

use std::process::ExitCode;

use super::{App, Control};
use crate::core::config::render_table;
use crate::core::error::Error;
use crate::shell::health;

impl App {
    /// `--check`: validate everything a start would, open no socket.
    fn control_check(&mut self) -> Result<Option<ExitCode>, Error> {
        #[cfg(feature = "dashboard")]
        self.require_dashboard_secrets()?;
        #[cfg(feature = "webapp")]
        {
            for w in &self.webapp {
                w.validate()?;
            }
            crate::shell::webapp::single_installable(&self.webapp)?;
        }
        #[cfg(feature = "dashboard")]
        self.validate_browser_keys()?;
        // H11 (rule 12, fail-closed): the state directory must exist
        // and take a write NOW, not at the first login. The only
        // thing --check touches is a zero-byte probe, removed at once.
        let loaded = self.loaded.as_ref().expect("loaded");
        crate::shell::store::probe_state_dir(&loaded.state_dir, false)?;
        // 3.11.0: the sqlite files open read-only and are NOT
        // migrated or created by a check.
        #[cfg(feature = "storage")]
        for (file, known) in self.storage_files_to_check() {
            let inspection = crate::storage::Db::inspect(&loaded.state_dir.join(file), known)?;
            println!("{}", inspection.describe());
            if inspection.is_newer() {
                return Err(Error::config(
                    inspection.describe(),
                    "run the build that wrote it, or restore the pre-update copy taken before the update",
                ));
            }
        }
        for warning in self.startup_warnings() {
            eprintln!("warning: {warning}");
        }
        for check in self.checks.drain(..) {
            check()?;
        }
        println!("{}: configuration ok", self.spec.name);
        Ok(Some(ExitCode::SUCCESS))
    }

    /// `<name> update`: one supervised update attempt, exit 0/1 (K18).
    async fn control_update(&mut self) -> Result<Option<ExitCode>, Error> {
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

    /// `--healthcheck`: probe `/healthz` of a running instance (K7).
    async fn control_healthcheck(&self, url: Option<String>) -> Result<Option<ExitCode>, Error> {
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

    /// Answer the control command, if any. `Some(code)` means "exit now".
    pub async fn control(&mut self) -> Result<Option<ExitCode>, Error> {
        if let Some(cmd) = self.backup_cmd.take() {
            let code = crate::shell::backup::client::run(self.spec.name, &cmd).await;
            return Ok(Some(ExitCode::from(code)));
        }
        match self.control.clone() {
            None => Ok(None),
            Some(Control::Version) => {
                println!("{} {}", self.spec.name, self.spec.version);
                Ok(Some(ExitCode::SUCCESS))
            }
            Some(Control::Help(text)) => {
                print!("{text}");
                Ok(Some(ExitCode::SUCCESS))
            }
            Some(Control::Rekey) => self.control_rekey(),
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
            Some(Control::Knobs) => {
                print!("{}", self.spec.knobs_markdown());
                Ok(Some(ExitCode::SUCCESS))
            }
            Some(Control::Check) => self.control_check(),
            Some(Control::Update) => self.control_update().await,
            Some(Control::Healthcheck(url)) => self.control_healthcheck(url).await,
        }
    }
}
