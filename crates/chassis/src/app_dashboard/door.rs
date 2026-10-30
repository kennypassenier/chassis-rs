//! Who may come in: the dashboard's login secrets, whether it runs OPEN
//! (no login, the service opted in) and the key that seals the kit's
//! stores.

use crate::app::AppSpec;
use crate::core::crypto::Key;
use crate::core::error::Error;
use crate::shell::auth::Secrets;
use crate::shell::config_load::Loaded;
use crate::shell::time::random_hex;

/// The login decision made once at mount time.
pub(super) struct Door {
    pub(super) secrets: Option<Secrets>,
    pub(super) open: bool,
    pub(super) seal_key: Key,
}

impl Door {
    /// Read the secrets; refuse to mount without them unless the service
    /// opted in to running open.
    pub(super) fn resolve(spec: &AppSpec, loaded: &Loaded, prefix: &str) -> Result<Door, Error> {
        let secrets = Secrets::parse(prefix, loaded.get("token"), loaded.get("secret_key"))?;
        // The opt-in (AppSpec::open_dashboard): no secrets, no door. Nothing is
        // sealed — clients live in memory, no session is ever minted, passkeys
        // stay off — and every page carries the banner.
        let open = secrets.is_none() && spec.open_dashboard;
        if secrets.is_none() && !open {
            return Err(Error::config(
                format!(
                    "the dashboard is compiled in but {prefix}_TOKEN and {prefix}_SECRET_KEY are not set"
                ),
                format!(
                    "run `{} gen-secret` on a terminal and put both lines in the environment file; a dashboard never starts without a login unless the service opted in (AppSpec::open_dashboard)",
                    spec.name
                ),
            ));
        }
        let seal_key = match &secrets {
            Some(s) => s.key.clone(),
            // Never used to write anything: the open store below is in memory
            // and no session is created without a login.
            None => Key::parse_hex("open", &random_hex(32)?, "")?,
        };
        Ok(Door {
            secrets,
            open,
            seal_key,
        })
    }
}
