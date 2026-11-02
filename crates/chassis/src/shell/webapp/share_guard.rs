//! Cross-site protection for a GET share target.
//!
//! `csrf_guard` lets every GET through and the session cookie is `Lax`, which
//! a browser sends on a top-level navigation from another website. A share
//! target registered with `ShareTarget::get(path)` writes on GET by design,
//! so a link anywhere on the web could trigger it. The rule here, applied to
//! that one path only; the rule itself lives in `guards::cross_site`.

use axum::Router;
use axum::extract::Request;
use axum::http::StatusCode;
use axum::middleware::{Next, from_fn_with_state};
use axum::response::{IntoResponse, Response};

use crate::core::error::{Error, Kind};
use crate::shell::guards::cross_site;

/// Layer `router` so a request to `path` obeys the cross-site rule.
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
