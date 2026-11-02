//! Does a logged-out request want the login page, or an answer a program can
//! read? A `fetch` that follows a 303 to `/login` ends on a 200 HTML page
//! and the app sees "not JSON" instead of "logged out".
//!
//! Browsers state it themselves: `Sec-Fetch-Mode: navigate` (and a `Dest`
//! other than `empty`) is a page load; anything else (`cors`, `same-origin`,
//! `Dest: empty`) is script. Without those headers (an old browser, a plain
//! HTTP client) an `Accept` that names types but not `text/html` or `*/*`
//! (for example `application/json`) is script too. No headers at all keep
//! today's answer, the redirect.

use axum::http::HeaderMap;

/// True when the request is a script call that should get a 401, not a redirect.
pub(crate) fn is_script_call(h: &HeaderMap) -> bool {
    let text = |name| h.get(name).and_then(|v| v.to_str().ok()).map(str::trim);
    if text("sec-fetch-dest").is_some_and(|d| d.eq_ignore_ascii_case("empty")) {
        return true;
    }
    if let Some(mode) = text("sec-fetch-mode") {
        return !mode.eq_ignore_ascii_case("navigate");
    }
    match text("accept") {
        Some(a) => {
            let a = a.to_ascii_lowercase();
            !a.is_empty() && !a.contains("text/html") && !a.contains("*/*")
        }
        None => false,
    }
}
