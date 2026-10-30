//! Putting the kit's runtime script into the web app's HTML pages, so an app
//! cannot forget to load it. Its own module: it is pure byte work, apart
//! from serving (headers, caching) and from reading files.

use std::borrow::Cow;

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

/// `html` with the runtime tag added: before `</head>`, else before
/// `</body>`, else at the end. A page that already references the runtime
/// is returned as it is (borrowed), so the tag is there exactly once.
pub(super) fn with_runtime(html: Cow<'static, [u8]>) -> Cow<'static, [u8]> {
    let lower = html.to_ascii_lowercase();
    if find(&lower, RUNTIME_FILE.as_bytes()).is_some() {
        return html;
    }
    let at = find(&lower, b"</head>")
        .or_else(|| find(&lower, b"</body>"))
        .unwrap_or(html.len());
    let tag = runtime_tag();
    let mut out = Vec::with_capacity(html.len() + tag.len());
    out.extend_from_slice(&html[..at]);
    out.extend_from_slice(tag.as_bytes());
    out.extend_from_slice(&html[at..]);
    Cow::Owned(out)
}

/// The first position of `needle` in `hay`.
fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}
