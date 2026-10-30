//! The request handlers: the root fallback and the file response with its
//! cache headers, ETag and CSP.

use std::borrow::Cow;
use std::sync::Arc;

use axum::extract::{RawQuery, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};

use super::files::{content_type, read};
use super::inject::with_runtime;
use super::paths::relative_path;
use super::{DEFAULT_CSP, RESERVED, WebApp};

/// The fallback at the root: GET and HEAD of a path that is not the kit's.
/// The kit's own prefixes never fall through to the app, so a mistyped
/// `/api/...` is a 404, not the app's HTML.
pub(super) async fn serve_root(
    method: axum::http::Method,
    state: State<Arc<WebApp>>,
    uri: Uri,
    query: RawQuery,
    headers: HeaderMap,
) -> Response {
    let path = uri.path();
    let kit = RESERVED
        .iter()
        .any(|r| path == *r || path.starts_with(&format!("{r}/")));
    if kit || !(method == axum::http::Method::GET || method == axum::http::Method::HEAD) {
        return (StatusCode::NOT_FOUND, "no such route").into_response();
    }
    serve(state, uri, query, headers).await
}

/// The 404 for a missing file; it carries the app's policy like any answer.
fn not_found_with_csp(csp: HeaderValue) -> Response {
    let mut res = (StatusCode::NOT_FOUND, "no such file").into_response();
    res.headers_mut()
        .insert(header::CONTENT_SECURITY_POLICY, csp);
    res
}

/// The file a request asks for: a directory path (or the root) means the
/// `index.html` inside it.
fn wanted_path(rel: &str, uri_path: &str) -> String {
    if rel.is_empty() || uri_path.ends_with('/') && !rel.contains('.') {
        if rel.is_empty() {
            "index.html".to_string()
        } else {
            format!("{rel}/index.html")
        }
    } else {
        rel.to_string()
    }
}

pub(super) async fn serve(
    State(app): State<Arc<WebApp>>,
    uri: Uri,
    RawQuery(query): RawQuery,
    headers: HeaderMap,
) -> Response {
    let csp =
        HeaderValue::from_str(&app.csp).unwrap_or_else(|_| HeaderValue::from_static(DEFAULT_CSP));
    let Some(rel) = relative_path(&app.mount, uri.path()) else {
        return not_found_with_csp(csp);
    };
    let wanted = wanted_path(&rel, uri.path());
    let last_has_extension = rel.rsplit('/').next().is_some_and(|s| s.contains('.'));
    let (served, body) = match read(&app.source, &wanted).await {
        Some(b) => (wanted, b),
        // A route of the client-side router (`/app/fleet/media`): the app
        // decides what it shows. A missing file (`/app/js/gone.js`) stays
        // a 404, so a typo is not answered with HTML.
        None if !last_has_extension => match read(&app.source, "index.html").await {
            Some(b) => ("index.html".to_string(), b),
            None => return (StatusCode::NOT_FOUND, "no index.html").into_response(),
        },
        None => return not_found_with_csp(csp),
    };
    // The runtime script goes into HTML before the ETag is computed over the
    // served bytes, so the tag and the validator always agree.
    let body = if app.kit_runtime && content_type(&served).starts_with("text/html") {
        with_runtime(body)
    } else {
        body
    };
    let versioned = query.as_deref().is_some_and(|q| q.contains("v="));
    file_response(&served, body, versioned, &headers, csp)
}

/// The answer for a found file: its type, a cache policy, a strong ETag
/// (304 when the browser already has it) and the app's CSP.
fn file_response(
    served: &str,
    body: Cow<'static, [u8]>,
    versioned: bool,
    headers: &HeaderMap,
    csp: HeaderValue,
) -> Response {
    let etag = format!(
        "\"{}\"",
        crate::shell::assets::fnv_version(std::iter::once(("", body.as_ref())))
    );
    let cache = if versioned && served != "index.html" {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    let matches = headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.split(',').any(|t| t.trim() == etag));
    let mut res = if matches {
        StatusCode::NOT_MODIFIED.into_response()
    } else {
        (
            [(header::CONTENT_TYPE, content_type(served))],
            body.into_owned(),
        )
            .into_response()
    };
    let h = res.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
    if let Ok(v) = HeaderValue::from_str(&etag) {
        h.insert(header::ETAG, v);
    }
    h.insert(header::CONTENT_SECURITY_POLICY, csp);
    res
}
