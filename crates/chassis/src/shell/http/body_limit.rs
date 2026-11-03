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
        self.raised_for(path)
            .map_or(self.default, |(_, bytes)| bytes)
    }

    /// The app's raised cap that governs `path`, if any (longest prefix).
    fn raised_for(&self, path: &str) -> Option<(&str, usize)> {
        self.raised
            .iter()
            .filter(|(p, _)| covers(p, path))
            .max_by_key(|(p, _)| p.len())
            .map(|(p, bytes)| (p.as_str(), *bytes))
    }

    /// The 413 for `path`, naming the limit that actually applied: the
    /// route's own `body_limit` or the `max_body_bytes` knob (Habits, 4.5.1:
    /// a raised route's 413 named the knob that did not apply).
    fn too_large(&self, path: &str) -> Response {
        let (what, remedy) = match self.raised_for(path) {
            Some((prefix, bytes)) => (
                format!(
                    "the request body is larger than {bytes} bytes, the cap this service sets for {prefix}"
                ),
                format!(
                    "send a body within {bytes} bytes; the service raises it in code with body_limit({prefix:?}, …), not with max_body_bytes"
                ),
            ),
            None => (
                format!(
                    "the request body is larger than {} bytes, the cap for this route",
                    self.default
                ),
                "send a body within max_body_bytes (the knob <PREFIX>_MAX_BODY_BYTES sets it)"
                    .to_string(),
            ),
        };
        let mut out = Error::invalid(what, remedy).into_response();
        *out.status_mut() = StatusCode::PAYLOAD_TOO_LARGE;
        out
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
    let path = req.uri().path().to_string();
    if declared.is_some_and(|n| n > cap) {
        return limits.too_large(&path);
    }
    let (parts, body) = req.into_parts();
    let body = Body::new(Limited::new(body, cap));
    let res = next.run(Request::from_parts(parts, body)).await;
    // A streamed body crossed the cap inside an extractor: its bare 413 gets
    // the same named limit (a handler's own JSON 413 is left alone).
    if res.status() == StatusCode::PAYLOAD_TOO_LARGE && !is_json(&res) {
        return limits.too_large(&path);
    }
    res
}

fn is_json(res: &Response) -> bool {
    res.headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|ct| ct.starts_with("application/json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn text(res: Response) -> String {
        let bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    /// Habits (4.5.1): a raised route's 413 named `max_body_bytes`, the knob
    /// that did not apply; it names the route's own cap now.
    #[tokio::test]
    async fn a_413_names_the_limit_that_applied() {
        let limits = BodyLimits::new(1024, vec![("/data/import".into(), 4096)]).unwrap();
        let raised = limits.too_large("/data/import/x");
        assert_eq!(raised.status(), StatusCode::PAYLOAD_TOO_LARGE);
        let body = text(raised).await;
        assert!(
            body.contains("4096") && body.contains("/data/import"),
            "{body}"
        );
        assert!(body.contains("not with max_body_bytes"), "{body}");
        let plain = text(limits.too_large("/data/notes")).await;
        assert!(
            plain.contains("1024") && plain.contains("MAX_BODY_BYTES"),
            "{plain}"
        );
    }
}
