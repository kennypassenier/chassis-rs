//! The optional vector icon: a web app that ships `pwa/icon.svg` gets it in
//! the manifest (`sizes: "any"`) and as the tab icon, ahead of the PNGs. Its
//! own module because "is this file really an SVG" is asked from the
//! manifest, the page tags and the route, and must be answered one way.

use super::super::Source;

/// Where the web app keeps it, relative to its root (the URL path is the
/// same with a leading slash).
pub(super) const FILE: &str = "pwa/icon.svg";

/// Whether `bytes` are SVG text: valid UTF-8 that contains an `<svg` tag.
/// Anything else (an HTML error page, a PNG renamed) is not served as an
/// image, so a browser never takes it for one.
pub(super) fn is_svg(bytes: &[u8]) -> bool {
    std::str::from_utf8(bytes).is_ok_and(|t| t.to_ascii_lowercase().contains("<svg"))
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
