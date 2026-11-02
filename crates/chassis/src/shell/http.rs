//! The HTTP layer every service shares (W1, K3/AR4, AR13): a request-id
//! on every request, one access log line per request, and the kit's
//! error type rendered as JSON with its remedy.
//!
//! The request-id is accepted from the `x-request-id` header when
//! present (Traefik sets one) and generated otherwise, then echoed on the
//! response so a log line and a reply can be matched. It travels in the
//! response header rather than in error bodies: a body is written by the
//! handler, which does not always have the id at hand, while the header
//! is added by a layer that always does.

mod access_log_line;
mod error_page;
mod error_response;
mod hygiene;
pub(crate) mod policy;

// The dashboard's error page reads the request it renders for.
#[cfg(any(feature = "dashboard", test))]
pub(crate) use error_page::error_context;

use axum::Router;
use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::Response;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::request_id::{
    MakeRequestId, PropagateRequestIdLayer, RequestId, SetRequestIdLayer,
};

use crate::core::error::Kind;
use crate::shell::guards::{Guards, csrf_guard, in_flight_guard, timeout_guard};

static X_REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");

/// A fresh UUIDv4 per request when the caller sent none.
#[derive(Clone, Copy, Default)]
struct MakeUuid;

impl MakeRequestId for MakeUuid {
    fn make_request_id<B>(&mut self, _: &axum::http::Request<B>) -> Option<RequestId> {
        let id = uuid::Uuid::new_v4().to_string();
        HeaderValue::from_str(&id).ok().map(RequestId::new)
    }
}

/// What the access log needs besides the request: the metric to count in.
#[derive(Clone)]
pub struct AccessState {
    /// Full metric name, e.g. `inbox_http_requests_total`; empty = do not count.
    pub requests_total: String,
}

/// Renders a kit error as a page in the dashboard layout: `(status,
/// message, remedy)` → HTML. Supplied by the dashboard when it is mounted;
/// `None` without one, and every error stays JSON.
pub type HtmlErrorRenderer =
    std::sync::Arc<dyn Fn(StatusCode, &str, &str) -> Option<String> + Send + Sync>;

/// Whether the request is a browser navigation — a page load or a form
/// submit — as opposed to a script or API call: `Sec-Fetch-Mode: navigate`
/// (every modern browser), else an `Accept` that asks for HTML.
pub fn is_navigation(headers: &axum::http::HeaderMap) -> bool {
    let mode = headers
        .get("sec-fetch-mode")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !mode.is_empty() {
        return mode.eq_ignore_ascii_case("navigate");
    }
    headers
        .get(axum::http::header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|a| a.contains("text/html"))
}

/// CF-7 (2026-09-06): a refusal answered to a browser navigation renders
/// inside the dashboard layout — the same error and remedy, as a page with
/// a way back — never as a bare JSON document on its own tab. Scripts and
/// API callers keep the JSON shape (AR4). Sits outside the guards, so
/// their refusals pass through it too.
pub async fn html_errors(
    State(render): State<Option<HtmlErrorRenderer>>,
    req: Request,
    next: Next,
) -> Response {
    error_page::html_errors(State(render), req, next).await
}

/// Wrap a router with the kit's layers. Order, outermost first as a
/// request sees them: request-id set → access log (+ request counter) →
/// HTML errors for navigations → body-size cap → in-flight cap → CSRF
/// rule → request timeout → the routes; the id is propagated onto the
/// response on the way out.
pub fn with_kit_layers(
    router: Router,
    guards: Guards,
    access: AccessState,
    max_body_bytes: usize,
    html: Option<HtmlErrorRenderer>,
) -> Router {
    router
        .layer(middleware::from_fn_with_state(
            guards.clone(),
            timeout_guard,
        ))
        .layer(middleware::from_fn(csrf_guard))
        .layer(middleware::from_fn_with_state(
            guards.clone(),
            in_flight_guard,
        ))
        .layer(middleware::from_fn_with_state(
            guards,
            crate::shell::guards::untrusted_proxy_guard,
        ))
        .layer(RequestBodyLimitLayer::new(max_body_bytes))
        // Outside the limit layer, so its bare 413 passes through here.
        .layer(middleware::from_fn(json_413))
        // Outside every guard: their JSON refusals become pages for browsers.
        .layer(middleware::from_fn_with_state(html, html_errors))
        .layer(middleware::from_fn_with_state(access, access_log))
        .layer(PropagateRequestIdLayer::new(X_REQUEST_ID.clone()))
        .layer(SetRequestIdLayer::new(X_REQUEST_ID.clone(), MakeUuid))
        .layer(middleware::from_fn(sanitize_request_id))
        .layer(middleware::from_fn(security_headers))
}

/// S8: defence-in-depth headers on every response. The dashboard loads
/// scripts, styles and fonts only from itself (fonts are vendored), so the
/// policy can be strict; `'unsafe-inline'` for styles covers the templates'
/// small `style=""` attributes and nothing else.
pub async fn security_headers(req: Request, next: Next) -> Response {
    hygiene::security_headers(req, next).await
}

/// AR4, one error shape: the body-limit layer answers a declared oversize
/// with a bare 413; this turns that into the kit's JSON error with a
/// remedy, like every other refusal.
pub async fn json_413(req: Request, next: Next) -> Response {
    hygiene::json_413(req, next).await
}

/// S8: a caller-supplied `x-request-id` is echoed into every log line, so
/// it is accepted only when it looks like an id (`[A-Za-z0-9._-]{1,64}`);
/// anything else is dropped and a fresh one is generated downstream.
pub async fn sanitize_request_id(mut req: Request, next: Next) -> Response {
    let ok = req
        .headers()
        .get(&X_REQUEST_ID)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|s| {
            !s.is_empty()
                && s.len() <= 64
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
        });
    if !ok {
        req.headers_mut().remove(&X_REQUEST_ID);
    }
    next.run(req).await
}

impl Kind {
    /// The status each kind answers with (AR4).
    pub fn status(self) -> StatusCode {
        match self {
            Kind::Config => StatusCode::SERVICE_UNAVAILABLE,
            Kind::Unauthorized => StatusCode::UNAUTHORIZED,
            Kind::NotFound => StatusCode::NOT_FOUND,
            Kind::Invalid => StatusCode::BAD_REQUEST,
            Kind::Overloaded => StatusCode::SERVICE_UNAVAILABLE,
            Kind::Dependency => StatusCode::BAD_GATEWAY,
            Kind::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

/// The bare layers for tests that need no guards.
pub fn with_request_id_only(router: Router) -> Router {
    router
        .layer(middleware::from_fn_with_state(
            AccessState {
                requests_total: String::new(),
            },
            access_log,
        ))
        .layer(PropagateRequestIdLayer::new(X_REQUEST_ID.clone()))
        .layer(SetRequestIdLayer::new(X_REQUEST_ID.clone(), MakeUuid))
}

/// One line per request at `info` (K4), carrying the request id, and one
/// increment of `<prefix>_http_requests_total{route,status}` (K7). The
/// `route` label is the matched route pattern, not the raw path, so an
/// id in the URL cannot multiply the series.
async fn access_log(State(access): State<AccessState>, req: Request<Body>, next: Next) -> Response {
    access_log_line::run(State(access), req, next).await
}

#[cfg(test)]
mod tests;
