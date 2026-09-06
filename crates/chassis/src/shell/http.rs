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

use std::time::Instant;

use axum::Router;
use axum::body::Body;
use axum::extract::{MatchedPath, Request, State};
use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::request_id::{
    MakeRequestId, PropagateRequestIdLayer, RequestId, SetRequestIdLayer,
};

use crate::core::error::{Error, Kind};
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
    let wants_page = render.is_some() && is_navigation(req.headers());
    let res = next.run(req).await;
    let Some(render) = render else { return res };
    if !wants_page || !res.status().is_client_error() && !res.status().is_server_error() {
        return res;
    }
    let is_json = res
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|ct| ct.starts_with("application/json"));
    if !is_json {
        return res;
    }
    let (mut parts, body) = res.into_parts();
    // Kit errors are two short strings; anything larger is not one.
    let bytes = match axum::body::to_bytes(body, 64 * 1024).await {
        Ok(b) => b,
        Err(_) => return Response::from_parts(parts, Body::empty()),
    };
    let parsed: serde_json::Value = serde_json::from_slice(&bytes).unwrap_or_default();
    let message = parsed["error"].as_str().unwrap_or("request refused");
    let remedy = parsed["remedy"].as_str().unwrap_or("");
    match render(parts.status, message, remedy) {
        Some(html) => {
            parts.headers.remove(axum::http::header::CONTENT_LENGTH);
            parts.headers.insert(
                axum::http::header::CONTENT_TYPE,
                HeaderValue::from_static("text/html; charset=utf-8"),
            );
            Response::from_parts(parts, Body::from(html))
        }
        None => Response::from_parts(parts, Body::from(bytes)),
    }
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
    let mut res = next.run(req).await;
    let h = res.headers_mut();
    let put = |h: &mut axum::http::HeaderMap, k: &'static str, v: &'static str| {
        h.entry(k)
            .or_insert(axum::http::HeaderValue::from_static(v));
    };
    put(
        h,
        "content-security-policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    put(h, "x-content-type-options", "nosniff");
    put(h, "x-frame-options", "DENY");
    // CF-7 (2026-09-06): `same-origin`, not `no-referrer`. Under
    // `no-referrer` a browser sends `Origin: null` on every form submit (a
    // navigation, per the Fetch standard) and the CSRF rule refused every
    // dashboard form — login included — from Chrome. `same-origin` keeps
    // the referrer inside this host and still blanks it towards others.
    put(h, "referrer-policy", "same-origin");
    res
}

/// AR4, one error shape: the body-limit layer answers a declared oversize
/// with a bare 413; this turns that into the kit's JSON error with a
/// remedy, like every other refusal.
pub async fn json_413(req: Request, next: Next) -> Response {
    let res = next.run(req).await;
    if res.status() != axum::http::StatusCode::PAYLOAD_TOO_LARGE {
        return res;
    }
    let is_json = res
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|ct| ct.starts_with("application/json"));
    if is_json {
        return res;
    }
    let mut out = Error::invalid(
        "the request body is larger than this service accepts",
        "send a body within max_body_bytes (the knob <PREFIX>_MAX_BODY_BYTES sets it)",
    )
    .into_response();
    *out.status_mut() = axum::http::StatusCode::PAYLOAD_TOO_LARGE;
    out
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
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let route = req
        .extensions()
        .get::<MatchedPath>()
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| "unmatched".to_string());
    let request_id = req
        .extensions()
        .get::<RequestId>()
        .and_then(|id| id.header_value().to_str().ok())
        .unwrap_or("-")
        .to_string();
    let started = Instant::now();
    let response = next.run(req).await;
    let status = response.status().as_u16();
    if !access.requests_total.is_empty() {
        metrics::counter!(
            access.requests_total.clone(),
            "route" => route.clone(),
            "status" => status.to_string()
        )
        .increment(1);
    }
    tracing::info!(
        method = %method,
        path = %path,
        route = %route,
        status,
        duration_ms = started.elapsed().as_millis() as u64,
        request_id = %request_id,
        "request"
    );
    response
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

impl IntoResponse for Error {
    /// `{"error": …, "remedy": …}` with the kind's status. Internal errors
    /// keep their remedy but the message is logged, not leaked: the caller
    /// cannot act on a stack of ours, and it may name paths.
    fn into_response(self) -> Response {
        let status = self.kind.status();
        let message = if self.kind == Kind::Internal {
            tracing::error!(error = %self, "internal error");
            "internal error".to_string()
        } else {
            self.message
        };
        let body = serde_json::json!({ "error": message, "remedy": self.remedy });
        (status, axum::Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::get;
    use tower::ServiceExt;

    #[tokio::test]
    async fn request_id_is_generated_or_echoed() {
        let app = with_request_id_only(Router::new().route("/", get(|| async { "ok" })));
        let res = app
            .clone()
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let generated = res
            .headers()
            .get("x-request-id")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        assert_eq!(generated.len(), 36, "uuid v4 text form");

        let res = app
            .oneshot(
                Request::builder()
                    .uri("/")
                    .header("x-request-id", "abc-123")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.headers().get("x-request-id").unwrap(), "abc-123");
    }

    #[tokio::test]
    async fn error_renders_json_with_remedy_and_status() {
        async fn failing() -> Result<&'static str, Error> {
            Err(Error::new(
                Kind::NotFound,
                "no such client",
                "issue one on /clients first",
            ))
        }
        let app = Router::new().route("/", get(failing));
        let res = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
        let bytes = axum::body::to_bytes(res.into_body(), 4096).await.unwrap();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v["error"], "no such client");
        assert_eq!(v["remedy"], "issue one on /clients first");
    }

    #[tokio::test]
    async fn internal_error_hides_its_message() {
        async fn failing() -> Result<&'static str, Error> {
            Err(Error::internal(
                "/var/lib/secret/path exploded",
                "retry; if it persists read the log",
            ))
        }
        let app = Router::new().route("/", get(failing));
        let res = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let bytes = axum::body::to_bytes(res.into_body(), 4096).await.unwrap();
        let text = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(!text.contains("/var/lib"));
        assert!(text.contains("retry"));
    }

    /// CF-7: a browser navigation gets the refusal as a page, a script the JSON.
    #[tokio::test]
    async fn navigations_get_errors_as_pages_and_scripts_get_json() {
        let render: HtmlErrorRenderer = std::sync::Arc::new(|status, msg, remedy| {
            Some(format!(
                "<html>{} · {msg} · {remedy}</html>",
                status.as_u16()
            ))
        });
        let app = Router::new()
            .route(
                "/act",
                axum::routing::post(|| async {
                    (
                        StatusCode::FORBIDDEN,
                        axum::Json(serde_json::json!({
                            "error": "cross-site request refused",
                            "remedy": "use the dashboard"
                        })),
                    )
                }),
            )
            .layer(middleware::from_fn_with_state(Some(render), html_errors));
        let nav = Request::builder()
            .method("POST")
            .uri("/act")
            .header("sec-fetch-mode", "navigate")
            .body(Body::empty())
            .unwrap();
        let res = app.clone().oneshot(nav).await.unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN, "the status is kept");
        assert!(
            res.headers()[axum::http::header::CONTENT_TYPE]
                .to_str()
                .unwrap()
                .starts_with("text/html")
        );
        let body = axum::body::to_bytes(res.into_body(), 4096).await.unwrap();
        let body = String::from_utf8(body.to_vec()).unwrap();
        assert!(
            body.contains("403 · cross-site request refused · use the dashboard"),
            "{body}"
        );

        let script = Request::builder()
            .method("POST")
            .uri("/act")
            .body(Body::empty())
            .unwrap();
        let res = app.oneshot(script).await.unwrap();
        assert!(
            res.headers()[axum::http::header::CONTENT_TYPE]
                .to_str()
                .unwrap()
                .starts_with("application/json"),
            "a script keeps the JSON shape"
        );
        let body = axum::body::to_bytes(res.into_body(), 4096).await.unwrap();
        assert!(String::from_utf8_lossy(&body).contains("\"remedy\""));
    }
}
