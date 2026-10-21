//! Putting the preferences into every signed-in HTML page (3.12.0), so the
//! browser needs no request before first paint: the values ride in a JSON
//! block right after `<head>`, followed by the classic script that applies
//! them (`static/prefs-boot.js`) before any module runs.

use axum::body::Body;
use axum::extract::State;
use axum::http::header::{CACHE_CONTROL, CONTENT_ENCODING, CONTENT_LENGTH, CONTENT_TYPE, ETAG};
use axum::http::{HeaderValue, Method, Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::prefs_api::login_scope;
use super::prefs_rules::Prefs;
use crate::shell::auth::Caller;

/// JSON for an HTML `<script type="application/json">` block: `<` is
/// escaped so the value can never close the tag or open a comment.
fn script_safe(json: &serde_json::Value) -> String {
    json.to_string()
        .replace('<', "\\u003c")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

/// What goes right after `<head>`: the values, then the script that
/// applies them (a classic script, so it runs before any module and before
/// the page paints).
fn block(snapshot: &serde_json::Value) -> String {
    format!(
        "<script type=\"application/json\" id=\"chassis-prefs\">{}</script><script src=\"/static/prefs-boot.js\"></script>",
        script_safe(snapshot)
    )
}

/// Put `block` after the opening `<head …>` tag; `None` without one or when
/// the page already carries it.
pub(crate) fn inject_into_head(html: &str, block: &str) -> Option<String> {
    if html.contains("id=\"chassis-prefs\"") {
        return None;
    }
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(i) = lower[from..].find("<head") {
        let start = from + i;
        let after = lower.as_bytes().get(start + 5).copied();
        if matches!(
            after,
            Some(b'>') | Some(b' ') | Some(b'\t') | Some(b'\n') | Some(b'\r')
        ) {
            let end = start + lower[start..].find('>')? + 1;
            let mut out = String::with_capacity(html.len() + block.len());
            out.push_str(&html[..end]);
            out.push_str(block);
            out.push_str(&html[end..]);
            return Some(out);
        }
        from = start + 5;
    }
    None
}

/// Layer on the signed-in HTML routes (the kit's pages, the project's pages,
/// the web app). Only a successful HTML answer to an admin is touched. A
/// conditional request is made unconditional first: the values change
/// without the file changing, so a 304 would show a stale copy.
pub(crate) async fn inject(State(p): State<Prefs>, mut req: Request<Body>, next: Next) -> Response {
    let admin = matches!(req.extensions().get::<Caller>(), Some(Caller::Admin));
    if !admin || req.method() != Method::GET {
        return next.run(req).await;
    }
    let scope = login_scope(&Caller::Admin);
    req.headers_mut().remove(axum::http::header::IF_NONE_MATCH);
    req.headers_mut()
        .remove(axum::http::header::IF_MODIFIED_SINCE);
    let resp = next.run(req).await;
    let is_html = resp.status() == StatusCode::OK
        && resp
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with("text/html"))
        && !resp.headers().contains_key(CONTENT_ENCODING);
    if !is_html {
        return resp;
    }
    let (mut parts, body) = resp.into_parts();
    let Ok(bytes) = axum::body::to_bytes(body, 8 * 1024 * 1024).await else {
        return (StatusCode::INTERNAL_SERVER_ERROR, "page too large").into_response();
    };
    let Ok(html) = std::str::from_utf8(&bytes) else {
        return Response::from_parts(parts, Body::from(bytes));
    };
    // A failed read must not break the page: it loads, and the script finds
    // no block and leaves the browser's own values alone.
    let out = match p.snapshot(&scope, "").await {
        Ok(snap) => inject_into_head(html, &block(&snap)),
        Err(e) => {
            tracing::warn!(error = %e, "preferences: could not read them for a page");
            None
        }
    };
    parts.headers.remove(CONTENT_LENGTH);
    match out {
        Some(page) => {
            parts.headers.remove(ETAG);
            parts
                .headers
                .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
            Response::from_parts(parts, Body::from(page))
        }
        None => Response::from_parts(parts, Body::from(bytes)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_block_goes_after_the_opening_head_tag_once() {
        let b = "<X>";
        assert_eq!(
            inject_into_head("<html><head><title>t</title></head>", b).unwrap(),
            "<html><head><X><title>t</title></head>"
        );
        assert_eq!(
            inject_into_head("<HTML><HEAD lang=a >x", b).unwrap(),
            "<HTML><HEAD lang=a ><X>x"
        );
        // <header> is not <head>.
        assert!(inject_into_head("<body><header>x</header>", b).is_none());
        assert!(inject_into_head("<head id=\"chassis-prefs\">", b).is_none());
    }

    #[test]
    fn a_value_cannot_close_the_script_block() {
        let s = script_safe(&json!({"keys": {"k": "</script><!-- x"}}));
        assert!(!s.contains("</script"));
        assert!(!s.contains("<!--"));
        let back: serde_json::Value = serde_json::from_str(&s).unwrap();
        assert_eq!(back["keys"]["k"], "</script><!-- x");
    }
}
