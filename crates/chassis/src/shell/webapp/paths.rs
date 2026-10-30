//! Request path to asset path: percent-decoding and the traversal refusal.
//! Its own module because it is the security boundary for the directory
//! source and deserves reading on its own.

use std::path::{Component, Path};

/// The asset path a request names, relative to the app root, or `None`
/// for anything that tries to leave it.
pub(super) fn relative_path(mount: &str, uri_path: &str) -> Option<String> {
    let rest = uri_path.strip_prefix(mount)?.trim_start_matches('/');
    let decoded = percent_decode(rest)?;
    let mut clean = Vec::new();
    for part in Path::new(&decoded).components() {
        match part {
            Component::Normal(p) => clean.push(p.to_str()?.to_string()),
            Component::CurDir => {}
            // `..`, a root or a prefix: never inside the app.
            _ => return None,
        }
    }
    if decoded.contains('\\') || decoded.contains('\0') {
        return None;
    }
    Some(clean.join("/"))
}

/// `%xx` decoding; `None` for a malformed escape or a non-UTF-8 result.
fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = s.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}
