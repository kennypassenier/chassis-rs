//! Putting the kit's runtime script into the web app's HTML pages, so an app
//! cannot forget to load it. Its own module: it is pure byte work, apart
//! from serving (headers, caching) and from reading files.

use std::borrow::Cow;

use super::pwa::HeadTag;

/// The file name that marks "this page already loads the runtime".
const RUNTIME_FILE: &str = "webapp-runtime.js";

/// The tag for the runtime module. The path is absolute (`/static/...`), so
/// it resolves the same for an app mounted at a sub-path; `?v=` is the
/// kit's asset version, so the URL is cached for a year and changes with
/// any kit asset (and with it the page's ETag).
pub(super) fn runtime_tag() -> String {
    format!(
        "<script type=\"module\" src=\"/static/chassis/{RUNTIME_FILE}?v={}\"></script>",
        crate::shell::assets::asset_version()
    )
}

/// `html` with the tags the server owns added: the runtime script when
/// `runtime` is on and the PWA tags that are given. Each goes before
/// `</head>`, else before `</body>`, else at the end. A tag the page already
/// carries (the runtime file named, `rel="manifest"`, a `theme-color` meta,
/// an `apple-touch-icon`) is skipped, so each is there exactly once, and a
/// page that needs nothing is returned as it is (borrowed).
pub(super) fn with_head_tags(
    html: Cow<'static, [u8]>,
    runtime: bool,
    pwa: Option<&[HeadTag]>,
) -> Cow<'static, [u8]> {
    let lower = html.to_ascii_lowercase();
    // Quotes removed, so `rel="manifest"`, `rel='manifest'` and `rel=manifest` all match.
    let compact: Vec<u8> = lower
        .iter()
        .copied()
        .filter(|b| *b != b'"' && *b != b'\'')
        .collect();
    let mut tags = String::new();
    if runtime && find(&lower, RUNTIME_FILE.as_bytes()).is_none() {
        tags.push_str(&runtime_tag());
    }
    for tag in pwa.unwrap_or_default() {
        if find(&compact, tag.key.as_bytes()).is_none() {
            tags.push_str(&tag.html);
        }
    }
    if tags.is_empty() {
        return html;
    }
    let at = find(&lower, b"</head>")
        .or_else(|| find(&lower, b"</body>"))
        .unwrap_or(html.len());
    let mut out = Vec::with_capacity(html.len() + tags.len());
    out.extend_from_slice(&html[..at]);
    out.extend_from_slice(tags.as_bytes());
    out.extend_from_slice(&html[at..]);
    Cow::Owned(out)
}

/// The first position of `needle` in `hay`.
fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}
