//! Whether a request was sent by a page on another website.
//!
//! Shared by every rule that must refuse a browser-borne cross-site call the
//! general CSRF rule lets through because the method is safe (GET): the share
//! target and the API's cookie-authenticated calls. The session cookie is
//! `Lax`, which a browser sends on a top-level navigation from another site.
//!
//! 1. `Sec-Fetch-Site` present: only `none` (a user-initiated navigation,
//!    e.g. the OS share sheet launching an installed app) and `same-origin`
//!    pass.
//! 2. Otherwise `Referer` present: its host must be this host. A browser
//!    sends no Referer for a share-sheet launch, so absence is not refusal.
//! 3. Neither header: allowed. Every browser that can install the app sends
//!    `Sec-Fetch-Site`; the remaining case is a client that sends no
//!    metadata at all (curl), which is not what a cross-site attack uses.
//!
//! Known limit: an old browser without `Sec-Fetch-Site` under a page with
//! `Referrer-Policy: no-referrer` sends neither header and passes.

use axum::http::{HeaderMap, header};

/// Why the request looks cross-site, or `None` when it may pass.
pub(crate) fn cross_site(h: &HeaderMap) -> Option<String> {
    let text = |name| h.get(name).and_then(|v| v.to_str().ok());
    if let Some(site) = text("sec-fetch-site") {
        let site = site.trim().to_ascii_lowercase();
        return (site != "none" && site != "same-origin")
            .then(|| format!("Sec-Fetch-Site: {site}"));
    }
    let referer = h.get(header::REFERER)?;
    let host = text(header::HOST.as_str()).unwrap_or("");
    let ref_host = referer
        .to_str()
        .ok()
        .and_then(|r| r.split("://").nth(1))
        .and_then(|rest| rest.split(['/', '?', '#']).next());
    match ref_host {
        Some(r) if r.eq_ignore_ascii_case(host) => None,
        _ => Some("Referer names another host".into()),
    }
}
