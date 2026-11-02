//! The browser-policy headers that depend on configuration: the
//! `Permissions-Policy` (with the features an app opted back in),
//! `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` and, over HTTPS only,
//! `Strict-Transport-Security`. The static headers (CSP, nosniff, framing,
//! referrer) stay in `hygiene`; these need state, so they are their own layer.

use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;

use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderMap, HeaderValue};
use axum::middleware::Next;
use axum::response::Response;

use crate::core::error::Error;

/// Powerful features switched off for every page unless an app opts in.
/// Only features no kit page uses: Web Push, the share target, the service
/// worker, clipboard writes and passkeys are not governed by any of these
/// (and `clipboard-*`, `publickey-credentials-*`, `autoplay` are not listed).
pub(crate) const DENIED_BY_DEFAULT: &[&str] = &[
    "accelerometer",
    "camera",
    "display-capture",
    "geolocation",
    "gyroscope",
    "magnetometer",
    "microphone",
    "midi",
    "payment",
    "usb",
];

/// HSTS lifetime: one year, no `includeSubDomains`, no `preload`: an app on
/// one host must not commit its siblings.
const HSTS: &str = "max-age=31536000";

/// What the layer needs per request; built once at start.
#[derive(Clone)]
pub(crate) struct HeaderPolicy {
    permissions: HeaderValue,
    trusted_proxies: Arc<Vec<IpAddr>>,
}

impl HeaderPolicy {
    /// `allowed`: features the app opted back in (`(self)` for those).
    pub(crate) fn new(allowed: &[String], trusted: Arc<Vec<IpAddr>>) -> Result<Self, Error> {
        for f in allowed {
            if f.is_empty() || !f.bytes().all(|b| b.is_ascii_lowercase() || b == b'-') {
                return Err(Error::config(
                    format!("browser feature `{f}` is not a Permissions-Policy feature name"),
                    "pass the lowercase feature name, e.g. `camera` or `geolocation`",
                ));
            }
        }
        let mut parts: Vec<String> = DENIED_BY_DEFAULT
            .iter()
            .filter(|d| !allowed.iter().any(|a| a == **d))
            .map(|d| format!("{d}=()"))
            .collect();
        parts.extend(allowed.iter().map(|a| format!("{a}=(self)")));
        let permissions = HeaderValue::from_str(&parts.join(", ")).map_err(|e| {
            Error::internal(
                format!("permissions-policy value: {e}"),
                "report this: the value is built from validated names",
            )
        })?;
        Ok(Self {
            permissions,
            trusted_proxies: trusted,
        })
    }

    fn https(&self, req_headers: &HeaderMap, peer: Option<SocketAddr>) -> bool {
        peer.is_some_and(|p| crate::shell::guards::is_https(p, req_headers, &self.trusted_proxies))
    }
}

/// Adds the configured headers to every answer; a handler's own value wins.
pub(crate) async fn policy_headers(
    State(p): State<HeaderPolicy>,
    req: Request,
    next: Next,
) -> Response {
    let peer = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|c| c.0);
    let https = p.https(req.headers(), peer);
    let mut res = next.run(req).await;
    let h = res.headers_mut();
    h.entry("permissions-policy").or_insert(p.permissions);
    h.entry("cross-origin-opener-policy")
        .or_insert(HeaderValue::from_static("same-origin"));
    // Nothing the kit serves is meant to be embedded by another origin: the
    // PWA manifest and icons, the worker, the fonts and the API are all
    // fetched by the page itself, and Web Push is server to push service.
    h.entry("cross-origin-resource-policy")
        .or_insert(HeaderValue::from_static("same-origin"));
    if https {
        h.entry("strict-transport-security")
            .or_insert(HeaderValue::from_static(HSTS));
    }
    res
}

#[cfg(test)]
mod tests;
