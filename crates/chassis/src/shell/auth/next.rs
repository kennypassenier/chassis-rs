//! Where a login lands: the page the visitor was sent away from.
//!
//! A logged-out navigation is redirected to `/login?next=<path+query>`; the
//! form carries the value back and a successful login (token or passkey)
//! goes there. The value comes from the visitor's own query string, so it is
//! never trusted: only a plain same-origin path survives, anything else
//! falls back to `/` (an open redirect would turn the login page into a
//! phishing launcher).

use serde::Deserialize;

use super::LoginForm;

/// Longest `next` kept; a longer one is more likely an attack than a page.
const MAX_LEN: usize = 2048;

/// Pages a login must never bounce back to.
const REFUSED_PATHS: [&str; 2] = ["/login", "/logout"];

/// `next` when it is a safe same-origin path, else `None`.
///
/// Safe means: a single leading `/` (not `//`, which browsers read as a
/// host), no backslash (`/\evil` is `//evil` to a browser), no control
/// character (browsers drop tab and newlines, so `/\t/evil` becomes
/// `//evil`; CR/LF also split headers), no scheme, and not the login or
/// logout page itself. The caller sees the value after ONE percent-decode
/// (query or form extractor), so `%2F%2Fevil` arrives as `//evil` and is
/// refused; a double-encoded one stays a harmless literal path.
pub(crate) fn safe_next(next: &str) -> Option<&str> {
    let bytes = next.as_bytes();
    if next.len() > MAX_LEN || bytes.first() != Some(&b'/') || bytes.get(1) == Some(&b'/') {
        return None;
    }
    if next
        .chars()
        .any(|c| c == '\\' || c.is_control() || c == ' ')
    {
        return None;
    }
    let path = next.split(['?', '#']).next().unwrap_or(next);
    if REFUSED_PATHS.iter().any(|p| path.eq_ignore_ascii_case(p)) {
        return None;
    }
    Some(next)
}

/// Where a successful login goes: `next` when safe, else `/`.
pub(crate) fn destination(next: Option<&str>) -> String {
    next.and_then(safe_next).unwrap_or("/").to_string()
}

/// The login URL for a logged-out navigation to `path_and_query`: plain
/// `/login` when there is nothing worth returning to (the home page, or an
/// unsafe value), else `/login?next=<percent-encoded>`.
pub(crate) fn login_url(path_and_query: &str) -> String {
    match safe_next(path_and_query) {
        Some(next) if next != "/" => format!("/login?next={}", encode(next)),
        _ => "/login".to_string(),
    }
}

/// Percent-encode everything but RFC 3986 unreserved characters.
fn encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 2);
    for b in value.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// The dashboard login form with its `next` field. A separate type from the
/// public [`LoginForm`] so the public contract stays as it was.
#[derive(Debug, Deserialize)]
pub(crate) struct LoginFormNext {
    token: String,
    #[serde(default)]
    remember: Option<String>,
    #[serde(default)]
    next: Option<String>,
}

impl LoginFormNext {
    /// The credentials for [`super::login`] and the raw (unchecked) `next`.
    pub(crate) fn split(self) -> (LoginForm, Option<String>) {
        let form = LoginForm {
            token: self.token,
            remember: self.remember,
        };
        (form, self.next)
    }
}

/// The login page's query string.
#[derive(Debug, Deserialize)]
pub(crate) struct NextQuery {
    #[serde(default)]
    pub(crate) next: Option<String>,
}
