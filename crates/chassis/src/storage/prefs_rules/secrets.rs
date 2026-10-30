//! What counts as a secret or an unusable key: the words that name a
//! secret, the shape of a valid key, and the heuristic for a value that is
//! almost certainly a secret. Its own module because these rules decide what
//! the preferences refuse, apart from the allow-list that decides what syncs.

use serde_json::Value as Json;

use super::PrefLimits;

/// Words that mark a key as a secret's. A declaration naming one is refused
/// at start; so is a request key that does.
pub(super) const SECRET_WORDS: [&str; 12] = [
    "token",
    "secret",
    "password",
    "passwd",
    "passphrase",
    "credential",
    "apikey",
    "api-key",
    "api_key",
    "bearer",
    "privatekey",
    "private-key",
];

pub(crate) fn looks_secret_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    SECRET_WORDS.iter().any(|w| lower.contains(w))
}

/// What makes a key unusable, and nothing else (Kenny, 2026-10-21: any app
/// may give any setting any name): empty, longer than the limit, a control
/// character, or `.` / `..` whole, which a URL path cannot carry. Colons,
/// slashes, spaces, `%`, `?`, `#` and non-ASCII are all fine; the browser
/// script encodes the key into the path.
pub(super) fn key_ok(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= PrefLimits::MAX_KEY_BYTES
        && !key.chars().any(char::is_control)
        && key != "."
        && key != ".."
}

/// A value that is almost certainly a secret: a PEM block, a JWT, a bearer
/// credential, or the service's own login token or key. A heuristic with a
/// short list, not a scanner: the real rule is "never declare a secret".
pub(super) fn looks_like_secret(value: &str, own: &[String]) -> Option<&'static str> {
    if value.contains("-----BEGIN ") {
        return Some("a PEM key or certificate");
    }
    if own.iter().any(|s| value.contains(s.as_str())) {
        return Some("this service's own login token or key");
    }
    if let Some(i) = value.to_ascii_lowercase().find("bearer ") {
        let rest = &value[i + 7..];
        if rest
            .bytes()
            .take_while(|b| !b.is_ascii_whitespace() && *b != b'"')
            .count()
            >= 16
        {
            return Some("a bearer credential");
        }
    }
    // A form draft (kp-themes' unsaved bar) is a JSON object of field names;
    // a field named like a secret is never stored, whatever kp excluded.
    if let Ok(Json::Object(fields)) = serde_json::from_str::<Json>(value)
        && fields.keys().any(|k| looks_secret_name(k))
    {
        return Some("a form draft with a secret field (password, token, key)");
    }
    let b = value.as_bytes();
    let mut from = 0;
    while let Some(off) = value[from..].find("eyJ") {
        let start = from + off;
        let end = start
            + b[start..]
                .iter()
                .take_while(|c| c.is_ascii_alphanumeric() || b"-_.".contains(c))
                .count();
        let token = &value[start..end];
        let parts: Vec<&str> = token.split('.').collect();
        if token.len() >= 30 && parts.len() == 3 && parts[0].len() > 8 && parts[1].len() > 8 {
            return Some("a signed token (JWT)");
        }
        from = start + 3;
    }
    None
}
