//! Checks `App` runs on its own configuration, at `--check` and at start:
//! required secrets, synced keys, the files to inspect, startup warnings and
//! the healthcheck URL.

use std::time::Duration;

use super::{App, AppSpec, Limits};
use crate::core::error::Error;
use crate::shell::config_load::Loaded;

impl App {
    /// With the dashboard compiled in, both secrets must be present; a
    /// half-configured or unconfigured login never starts (W6 = Don't do).
    #[cfg(feature = "dashboard")]
    pub(super) fn require_dashboard_secrets(&self) -> Result<(), Error> {
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
            // The opt-in (AppSpec::open_dashboard): no secrets is a valid,
            // loud configuration for a service that asked for it.
            None if self.spec.open_dashboard => Ok(()),
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

    /// 3.12.0: the synced keys are well formed, name no secret, and have a
    /// place to live. Run by `--check` and at start.
    #[cfg(feature = "dashboard")]
    pub(super) fn validate_browser_keys(&self) -> Result<(), Error> {
        let Some(keys) = &self.browser_keys else {
            return Ok(());
        };
        keys.validate()?;
        if self.prefs_store.is_none() && self.app_db.is_none() {
            return Err(Error::config(
                "App::sync_browser_keys needs somewhere to keep the preferences",
                "call App::app_db first (the preferences are a table of the app database, which can start with no tables of its own), or give App::prefs_store",
            ));
        }
        Ok(())
    }

    /// The sqlite files `--check` looks at, with how many migrations this
    /// build knows for each.
    #[cfg(feature = "storage")]
    pub(super) fn storage_files_to_check(&self) -> Vec<(String, usize)> {
        let mut out = Vec::new();
        #[cfg(feature = "dashboard")]
        out.push((
            crate::storage::kit_file_name(self.spec.name),
            crate::storage::kit_schema_version(),
        ));
        if let Some((_, spec)) = &self.app_db {
            out.push((format!("{}.db", self.spec.name), spec.migrations.len()));
        }
        out
    }

    /// Configuration that loads but will hurt (S4, critic #20): said at
    /// `--check` (stderr) and at start (log), never silently.
    pub(super) fn startup_warnings(&self) -> Vec<String> {
        let mut w = Vec::new();
        let loaded = self.loaded.as_ref().expect("loaded");
        let prefix = self.spec.prefix();
        #[cfg(feature = "dashboard")]
        if self.spec.open_dashboard
            && loaded.get("token").is_none()
            && loaded.get("secret_key").is_none()
        {
            w.push(format!(
                "the dashboard is OPEN: {prefix}_TOKEN and {prefix}_SECRET_KEY are not set and this service opted in, so anyone who can reach {} can use every page and every route. What now: run `{} gen-secret` and set both to close it",
                self.listen, self.spec.name
            ));
        }
        #[cfg(feature = "dashboard")]
        if let Some(raw) = loaded.get("trusted_admins")
            && !raw.trim().is_empty()
        {
            w.push(format!(
                "{prefix}_TRUSTED_ADMINS lets {} in as the admin without a login: anyone who can use that address reaches every page. It is meant for one machine whose address nobody else ever takes",
                raw.trim()
            ));
        }
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
}

/// The login configuration that is validated when the app is built, so
/// `--check` refuses it: a malformed public URL and the two dashboard
/// secrets.
pub(super) fn validate_login_config(
    #[cfg_attr(not(feature = "dashboard"), allow(unused_variables))] spec: &AppSpec,
    #[cfg_attr(not(feature = "dashboard"), allow(unused_variables))] loaded: &Loaded,
    #[cfg_attr(not(feature = "passkeys"), allow(unused_variables))] limits: &Limits,
) -> Result<(), Error> {
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
    Ok(())
}
