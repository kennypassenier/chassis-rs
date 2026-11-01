//! `WebApp::validate`: the start-up checks. Its own module because it holds
//! the list of reserved kit routes' error text apart from the serving code.

use super::{RESERVED, Source, WebApp};
use crate::core::error::Error;

impl WebApp {
    /// Refuse what would break at the first request: a mount that hides a
    /// kit route, a missing `index.html`, a directory that is not there.
    pub fn validate(&self) -> Result<(), Error> {
        let m = self.mount.as_str();
        if !m.is_empty() && !m.starts_with('/') {
            return Err(Error::config(
                format!("the web app's mount path `{m}` is not an absolute path"),
                "mount it at a path that starts with `/`, e.g. WebApp::embedded(FILES).at(\"/app\")",
            ));
        }
        if let Some(r) = RESERVED
            .iter()
            .find(|r| !m.is_empty() && (m == **r || m.starts_with(&format!("{r}/"))))
        {
            return Err(Error::config(
                format!("the web app's mount path `{m}` would hide the kit's own `{r}`"),
                "mount it at the root (the default) or elsewhere, e.g. `/app`; the kit's routes are /status, /login, /logout, /static, /api, /clients, /passkeys, /healthz, /readyz and /metrics",
            ));
        }
        if let Some(p) = &self.pwa {
            p.validate()?;
        }
        match &self.source {
            Source::Embedded(files) => {
                if !files.iter().any(|(p, _)| *p == "index.html") {
                    return Err(Error::config(
                        "the embedded web app has no `index.html`",
                        "add (\"index.html\", include_bytes!(…)) to the files passed to WebApp::embedded",
                    ));
                }
            }
            Source::Dir(dir) => {
                if !dir.join("index.html").is_file() {
                    return Err(Error::config(
                        format!("the web app directory {} has no index.html", dir.display()),
                        "point WebApp::dir at the folder that holds index.html",
                    ));
                }
            }
        }
        Ok(())
    }
}

/// Refuse a service whose web apps would install as more than one app: the
/// manifest, worker and icons live at the root, so there is room for one.
/// The remedy names the mounts, so the project knows which to opt out.
pub fn single_installable(apps: &[WebApp]) -> Result<(), Error> {
    let mounts: Vec<&str> = apps
        .iter()
        .filter(|a| a.is_installable())
        .map(WebApp::mount)
        .collect();
    if mounts.len() > 1 {
        return Err(Error::config(
            format!(
                "{} web apps are installable ({}), but a service installs as one app",
                mounts.len(),
                mounts.join(", ")
            ),
            "call .without_pwa() on every web app except the one to install",
        ));
    }
    Ok(())
}
