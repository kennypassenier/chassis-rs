//! The request-body cap (K10), with room for routes that need a bigger one.
//!
//! The kit used to put tower-http's `RequestBodyLimitLayer` around the whole
//! router. That layer wraps the body for everything inside it, so axum's
//! per-route `DefaultBodyLimit` can only ever lower the cap, never raise it:
//! an import or restore route sat behind the same 1 MiB as every other route.
//! This module replaces the layer with one that looks the cap up per request
//! (the default, or the raised one for a path an app marked through
//! [`App::body_limit`](crate::App::body_limit)); the behaviour for an
//! unmarked route is the same as before: a declared oversize is refused up
//! front, a streamed one when the limit is crossed, both as a 413 that
//! `json_413` turns into the kit's JSON error.

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use http_body_util::Limited;

use crate::core::error::Error;

/// The default cap plus the raised caps, one per path prefix.
#[derive(Debug, Clone)]
pub struct BodyLimits {
    default: usize,
    raised: Vec<(String, usize)>,
}

impl BodyLimits {
    /// Validate the app's raised caps. A prefix must be an absolute path and
    /// a cap must be above zero; anything else is a typo that would silently
    /// leave a route at the default, so it is refused at start.
    pub fn new(default: usize, raised: Vec<(String, usize)>) -> Result<Self, Error> {
        for (prefix, bytes) in &raised {
            if !prefix.starts_with('/') || *bytes == 0 {
                return Err(Error::config(
                    format!("body_limit({prefix:?}, {bytes}) is not usable"),
                    "give an absolute path prefix such as \"/data/import\" and a cap above 0 bytes",
                ));
            }
        }
        Ok(Self { default, raised })
    }

    /// The cap for a path: the longest matching prefix (a whole segment,
    /// `/data/import` covers `/data/import/x`, not `/data/imports`), else
    /// the default.
    pub fn for_path(&self, path: &str) -> usize {
        self.raised
            .iter()
            .filter(|(p, _)| covers(p, path))
            .max_by_key(|(p, _)| p.len())
            .map_or(self.default, |(_, bytes)| *bytes)
    }
}

fn covers(prefix: &str, path: &str) -> bool {
    path.strip_prefix(prefix)
        .is_some_and(|rest| rest.is_empty() || rest.starts_with('/') || prefix.ends_with('/'))
}

/// Refuse a body above the cap for this path: by `Content-Length` when it
/// is declared, otherwise while the body streams in.
pub async fn body_limit(State(limits): State<BodyLimits>, req: Request, next: Next) -> Response {
    let cap = limits.for_path(req.uri().path());
    let declared = req
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok());
    if declared.is_some_and(|n| n > cap) {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    }
    let (parts, body) = req.into_parts();
    let body = Body::new(Limited::new(body, cap));
    next.run(Request::from_parts(parts, body)).await
}
