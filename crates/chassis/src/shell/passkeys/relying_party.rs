//! Building the WebAuthn relying party from `<P>_PUBLIC_URL`.

use webauthn_rs::prelude::*;

use crate::core::error::Error;

/// Body of [`super::build_webauthn`].
pub(super) fn build(
    app_name: &str,
    prefix: &str,
    public_url: Option<&str>,
) -> Result<Webauthn, Error> {
    let raw = public_url.ok_or_else(|| {
        Error::config(
            format!("passkeys are compiled in but {prefix}_PUBLIC_URL is not set"),
            format!("set {prefix}_PUBLIC_URL to the https:// address the dashboard is reached at behind the proxy, e.g. https://inbox.example.lan"),
        )
    })?;
    let url = Url::parse(raw).map_err(|e| {
        Error::config(
            format!("{prefix}_PUBLIC_URL `{raw}` is not a URL: {e}"),
            "use the full origin, e.g. https://inbox.example.lan",
        )
    })?;
    if url.scheme() != "https" && url.host_str() != Some("localhost") {
        return Err(Error::config(
            format!("{prefix}_PUBLIC_URL must be https:// (browsers refuse passkeys elsewhere)"),
            "put Traefik or another TLS proxy in front and set the https origin here",
        ));
    }
    let rp_id = url.host_str().ok_or_else(|| {
        Error::config(
            format!("{prefix}_PUBLIC_URL has no host"),
            "use the full origin",
        )
    })?;
    WebauthnBuilder::new(rp_id, &url)
        .and_then(|b| b.rp_name(app_name).build())
        .map_err(|e| {
            Error::config(
                format!("cannot build the WebAuthn relying party: {e}"),
                "check PUBLIC_URL",
            )
        })
}
