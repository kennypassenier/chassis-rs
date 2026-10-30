//! The project's own half of the configuration file: its table, its typed
//! config and whether it is needed yet.

use super::{App, Control};
use crate::core::error::Error;
use crate::shell::config_load::Loaded;

impl App {
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
}
