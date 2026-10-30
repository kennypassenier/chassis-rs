//! The two configuration defaults `construct` derives before building an
//! `App`: the listen address and the state directory. Its own module so the
//! construction file stays about assembly.

use std::net::SocketAddr;
use std::path::PathBuf;

use crate::core::error::Error;
use crate::shell::config_load::Loaded;

use crate::app::AppSpec;

/// The `listen` knob as a socket address, or the config error saying how
/// to fix it.
pub(super) fn parse_listen(spec: &AppSpec, loaded: &Loaded) -> Result<SocketAddr, Error> {
    let listen_raw = loaded.get("listen").unwrap_or(spec.default_listen);
    listen_raw.parse().map_err(|_| {
        Error::config(
            format!("listen address `{listen_raw}` is not host:port"),
            format!(
                "set {}_LISTEN (or --listen) to something like 0.0.0.0:8080",
                spec.prefix()
            ),
        )
    })
}

impl AppSpec {
    pub(super) fn state_dir_default(&self) -> PathBuf {
        self.default_state_dir
            .clone()
            .unwrap_or_else(|| PathBuf::from("/var/lib").join(self.name))
    }
}
