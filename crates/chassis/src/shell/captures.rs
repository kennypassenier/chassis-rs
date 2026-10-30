//! The last requests per client (K13, AR7): what a connected service
//! actually sent, so a new integration can be debugged from the
//! dashboard without handing anyone the service's own token.
//!
//! A bounded ring per client id, in memory, with a TTL. Headers named in
//! the redaction list show `***`; bodies are cut at a byte cap with a
//! visible notice. Lost on restart, by decision (AR7): this is a debug
//! view, not a log.

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::Duration;

use axum::body::{Body, Bytes};
use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

use crate::shell::auth::Caller;
use crate::shell::time::{now_epoch, now_rfc3339};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Capture {
    pub at: String,
    pub method: String,
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub body_bytes: usize,
    pub truncated: bool,
    pub status: u16,
    /// `api` for a real call, `test` for the dashboard's test button (K14).
    pub source: &'static str,
    #[serde(skip)]
    expires_at: u64,
}

/// Knobs for the ring (AR3).
#[derive(Debug, Clone)]
pub struct CaptureConfig {
    pub keep: usize,
    pub body_bytes: usize,
    pub ttl: Duration,
    /// Lower-case header names shown as `***`.
    pub redact: Vec<String>,
}

impl CaptureConfig {
    /// The headers redacted regardless of configuration.
    pub const ALWAYS_REDACTED: [&'static str; 4] =
        ["authorization", "cookie", "set-cookie", "x-api-key"];

    pub fn is_redacted(&self, name: &str) -> bool {
        let n = name.to_ascii_lowercase();
        n == TEST_HEADER
            || Self::ALWAYS_REDACTED.contains(&n.as_str())
            || self.redact.iter().any(|r| r.eq_ignore_ascii_case(&n))
    }
}

/// The rings, keyed by client id.
#[derive(Clone)]
pub struct Captures {
    pub config: CaptureConfig,
    rings: Arc<std::sync::RwLock<HashMap<String, VecDeque<Capture>>>>,
    /// A random value made at start-up: the dashboard's own test route sends
    /// it in [`TEST_HEADER`], so only that request is filed as a test. A
    /// client that sends the header with any other value is an `api` call.
    test_key: Arc<str>,
}

impl Captures {
    pub fn new(config: CaptureConfig) -> Self {
        Self {
            config,
            rings: Arc::new(std::sync::RwLock::new(HashMap::new())),
            test_key: uuid::Uuid::new_v4().simple().to_string().into(),
        }
    }

    /// The value the dashboard's test route puts in [`TEST_HEADER`].
    pub(crate) fn test_key(&self) -> &str {
        &self.test_key
    }

    /// Whether `headers` carry this process's test key.
    fn is_own_test(&self, headers: &axum::http::HeaderMap) -> bool {
        headers
            .get(TEST_HEADER)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v == &*self.test_key)
    }

    /// Record one request for `client_id`.
    #[allow(clippy::too_many_arguments)]
    pub fn record(
        &self,
        client_id: &str,
        method: &str,
        path: &str,
        headers: &axum::http::HeaderMap,
        body: &[u8],
        status: u16,
        source: &'static str,
    ) {
        let now = now_epoch();
        let mut hs: Vec<(String, String)> = headers
            .iter()
            .map(|(k, v)| {
                let shown = if self.config.is_redacted(k.as_str()) {
                    "***".to_string()
                } else {
                    v.to_str().unwrap_or("<binary>").to_string()
                };
                (k.as_str().to_string(), shown)
            })
            .collect();
        hs.sort();
        let truncated = body.len() > self.config.body_bytes;
        let shown = &body[..body.len().min(self.config.body_bytes)];
        let capture = Capture {
            at: now_rfc3339(),
            method: method.to_string(),
            path: path.to_string(),
            headers: hs,
            body: String::from_utf8_lossy(shown).into_owned(),
            body_bytes: body.len(),
            truncated,
            status,
            source,
            expires_at: now + self.config.ttl.as_secs(),
        };
        let mut rings = self.rings.write().expect("captures lock");
        let ring = rings.entry(client_id.to_string()).or_default();
        ring.retain(|c| c.expires_at > now);
        while ring.len() >= self.config.keep.max(1) {
            ring.pop_front();
        }
        ring.push_back(capture);
    }

    /// The live captures for a client, newest first.
    pub fn list(&self, client_id: &str) -> Vec<Capture> {
        let now = now_epoch();
        let rings = self.rings.read().expect("captures lock");
        rings
            .get(client_id)
            .map(|r| {
                r.iter()
                    .filter(|c| c.expires_at > now)
                    .rev()
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Forget a client's captures (on delete).
    pub fn forget(&self, client_id: &str) {
        self.rings.write().expect("captures lock").remove(client_id);
    }
}

/// The header the dashboard's test route sends, carrying the per-process key.
pub(crate) const TEST_HEADER: &str = "x-chassis-test";

/// Middleware for API routes: after `require_caller` attached a `Caller`,
/// record the request for that client. The body is read into memory
/// (the body-size cap already bounds it) and handed on unchanged.
pub async fn capture_requests(
    State(captures): State<Captures>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let client_id = match req.extensions().get::<Caller>() {
        Some(Caller::Client { id, .. }) => Some(id.clone()),
        _ => None,
    };
    let Some(client_id) = client_id else {
        return next.run(req).await;
    };
    let (parts, body) = req.into_parts();
    // S3: the body limit layer surfaces as an error here, not in a handler;
    // swallowing it would hand the handler an EMPTY body with a 2xx.
    let bytes: Bytes = match axum::body::to_bytes(body, usize::MAX).await {
        Ok(b) => b,
        Err(e) => {
            let mut res = crate::core::error::Error::invalid(
                format!("the request body could not be read in full: {e}"),
                "send a body within max_body_bytes (the 413 says the limit is what stopped it)",
            )
            .into_response();
            *res.status_mut() = axum::http::StatusCode::PAYLOAD_TOO_LARGE;
            return res;
        }
    };
    let method = parts.method.to_string();
    let path = parts.uri.path().to_string();
    let headers = parts.headers.clone();
    let req = Request::from_parts(parts, Body::from(bytes.clone()));
    let response = next.run(req).await;
    // The dashboard's test route marks its request with this header and the
    // per-process key (`clients_api::send_test`); a header from outside,
    // without the key, is an ordinary call.
    let source = if captures.is_own_test(&headers) {
        "test"
    } else {
        "api"
    };
    captures.record(
        &client_id,
        &method,
        &path,
        &headers,
        &bytes,
        response.status().as_u16(),
        source,
    );
    response
}

#[cfg(test)]
mod tests;
