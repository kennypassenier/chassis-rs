//! Cross-site protection for a GET share target.
//!
//! `csrf_guard` lets every GET through and the session cookie is `Lax`, which
//! a browser sends on a top-level navigation from another website. A share
//! target registered with `ShareTarget::get(path)` writes on GET by design,
//! so a link anywhere on the web could trigger it. The rule here, applied to
//! that one path only:
//!
//! 1. `Sec-Fetch-Site` present: only `none` (a user-initiated navigation,
//!    which is what the OS share sheet launching an installed app is) and
//!    `same-origin` pass.
//! 2. Otherwise `Referer` present: its host must be this host. A browser
//!    sends no Referer for a share-sheet launch, so absence is not refusal.
//! 3. Neither header: allowed. Every browser that can install the app sends
//!    `Sec-Fetch-Site`; the remaining case is a client that sends no
//!    metadata at all (curl), which is not what a cross-site attack uses.
//!
//! Known limit: an old browser without `Sec-Fetch-Site` under a page with
//! `Referrer-Policy: no-referrer` sends neither header and passes.

use axum::Router;
use axum::extract::Request;
use axum::http::{HeaderMap, StatusCode, header};
use axum::middleware::{Next, from_fn_with_state};
use axum::response::{IntoResponse, Response};

use crate::core::error::{Error, Kind};

/// Layer `router` so a request to `path` obeys the rule above.
pub(crate) fn apply(router: Router, path: String) -> Router {
    router.layer(from_fn_with_state(path, share_guard))
}

async fn share_guard(
    axum::extract::State(path): axum::extract::State<String>,
    req: Request,
    next: Next,
) -> Response {
    if req.uri().path() == path
        && let Some(why) = cross_site(req.headers())
    {
        let mut res = Error::new(
            Kind::Unauthorized,
            format!("cross-site share refused ({why})"),
            "share from the installed app or its own pages, not from a link on another site",
        )
        .into_response();
        *res.status_mut() = StatusCode::FORBIDDEN;
        return res;
    }
    next.run(req).await
}

/// Why the request looks cross-site, or `None` when it may pass.
fn cross_site(h: &HeaderMap) -> Option<String> {
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
