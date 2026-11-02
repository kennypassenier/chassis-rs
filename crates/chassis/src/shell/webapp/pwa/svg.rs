//! The optional vector icon: a web app that ships `pwa/icon.svg` gets it in
//! the manifest (`sizes: "any"`) and as the tab icon, ahead of the PNGs. Its
//! own module because "is this file really an SVG" is asked from the
//! manifest, the page tags and the route, and must be answered one way.

use super::super::Source;

/// Where the web app keeps it, relative to its root (the URL path is the
/// same with a leading slash).
pub(super) const FILE: &str = "pwa/icon.svg";

/// The policy of the public icon: a vector image needs nothing, and opened
/// as a page (the URL is public) it must run no script whatever the app's
/// own policy allows.
pub(super) const CSP: &str = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/// Whether `bytes` are an SVG document: valid UTF-8 whose root element is
/// `<svg`, after an optional BOM, XML declaration, comments and doctype.
/// Anything else (an HTML page that merely contains an inline `<svg`, a PNG
/// renamed) is not served as an image, so a browser never takes it for one.
pub(super) fn is_svg(bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else {
        return false;
    };
    let mut rest = text.trim_start_matches('\u{feff}').trim_start();
    loop {
        let skip = if rest.starts_with("<?") {
            rest.find("?>").map(|i| i + 2)
        } else if rest.starts_with("<!--") {
            rest.find("-->").map(|i| i + 3)
        } else if rest.starts_with("<!") {
            doctype_end(rest)
        } else {
            break;
        };
        match skip {
            Some(n) => rest = rest[n..].trim_start(),
            None => return false,
        }
    }
    rest.strip_prefix("<svg")
        .and_then(|r| r.chars().next())
        .is_some_and(|c| c.is_whitespace() || c == '>' || c == '/')
}

/// The end of a `<!DOCTYPE ...>` declaration, past an internal subset in `[...]`.
fn doctype_end(s: &str) -> Option<usize> {
    let close = s.find('>')?;
    match s[..close].find('[') {
        Some(_) => s.find("]>").map(|i| i + 2).or(Some(close + 1)),
        None => Some(close + 1),
    }
}

/// Whether the web app ships a usable `pwa/icon.svg`. Synchronous: it is
/// asked while the manifest and the page tags are built, and the file is a
/// few kilobytes; an embedded app does no I/O at all.
pub(super) fn present(source: &Source) -> bool {
    match source {
        Source::Embedded(files) => files.iter().any(|(p, b)| *p == FILE && is_svg(b)),
        Source::Dir(root) => {
            let inside = |p: std::path::PathBuf| {
                let (canon, root) = (p.canonicalize().ok()?, root.canonicalize().ok()?);
                canon.starts_with(root).then_some(canon)
            };
            inside(root.join(FILE))
                .and_then(|p| std::fs::read(p).ok())
                .is_some_and(|b| is_svg(&b))
        }
    }
}
