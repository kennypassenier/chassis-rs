//! Browser-facing error pages (CF-7): the thread-local context an
//! [`HtmlErrorRenderer`] reads and the middleware that swaps a JSON refusal
//! for a page on navigations. Its own module because it is the only code
//! that rewrites response bodies. The context is only built where something
//! reads it: the dashboard's error page (and the unit tests).

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::HeaderValue;
use axum::middleware::Next;
use axum::response::Response;

#[cfg(any(feature = "dashboard", test))]
use super::X_REQUEST_ID;
use super::{HtmlErrorRenderer, is_navigation};

/// kit-kp11: what an error page knows about the request it answers, set
/// for the one call of the [`HtmlErrorRenderer`] so the renderer's
/// signature stays what it was: the request id to quote in a report, and
/// the request's headers, from which the dashboard tells whether the
/// browser is signed in (the page then draws the navigation and Log out,
/// as on every other page).
#[cfg(any(feature = "dashboard", test))]
#[derive(Debug, Clone, Default)]
pub(crate) struct ErrorContext {
    pub(crate) request_id: Option<String>,
    pub(crate) headers: axum::http::HeaderMap,
    /// trusted-sources: the request came from a trusted admin.
    #[cfg(feature = "dashboard")]
    pub(crate) trusted: bool,
}

#[cfg(any(feature = "dashboard", test))]
thread_local! {
    static ERROR_CONTEXT: std::cell::RefCell<ErrorContext> = std::cell::RefCell::new(ErrorContext::default());
}

/// The context of the error page being rendered right now (empty outside
/// a render).
#[cfg(any(feature = "dashboard", test))]
pub(crate) fn error_context() -> ErrorContext {
    ERROR_CONTEXT.with(|c| c.borrow().clone())
}

/// Body of [`super::html_errors`].
pub(super) async fn html_errors(
    State(render): State<Option<HtmlErrorRenderer>>,
    req: Request,
    next: Next,
) -> Response {
    let wants_page = render.is_some() && is_navigation(req.headers());
    #[cfg(any(feature = "dashboard", test))]
    let context = wants_page.then(|| ErrorContext {
        request_id: req
            .headers()
            .get(&X_REQUEST_ID)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string),
        headers: req.headers().clone(),
        #[cfg(feature = "dashboard")]
        trusted: crate::shell::trusted::is_trusted(req.extensions()),
    });
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
    #[cfg(any(feature = "dashboard", test))]
    ERROR_CONTEXT.with(|c| *c.borrow_mut() = context.unwrap_or_default());
    let page = render(parts.status, message, remedy);
    #[cfg(any(feature = "dashboard", test))]
    ERROR_CONTEXT.with(|c| *c.borrow_mut() = ErrorContext::default());
    match page {
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
