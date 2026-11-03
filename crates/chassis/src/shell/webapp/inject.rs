//! Putting the kit's runtime script into the web app's HTML pages, so an app
//! cannot forget to load it. Its own module: it is pure byte work, apart
//! from serving (headers, caching) and from reading files.

use std::borrow::Cow;

use super::pwa::HeadTag;

/// Which kp-themes delivery the injected runtime imports.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Runtime {
    /// The one-file bundle (the default).
    Bundle,
    /// The per-module entries under `kp/dist/js/` (`WebApp::kp_modules`).
    Modules,
}

impl Runtime {
    fn file(self) -> &'static str {
        match self {
            Runtime::Bundle => "webapp-runtime.js",
            Runtime::Modules => "webapp-runtime-modules.js",
        }
    }
}

/// The file names that mark "this page already loads the runtime": either
/// variant counts, so a page never gets both.
const RUNTIME_FILES: [&str; 2] = ["webapp-runtime.js", "webapp-runtime-modules.js"];

/// The tag for the runtime module. The path is absolute (`/static/...`), so
/// it resolves the same for an app mounted at a sub-path; `?v=` is the
/// kit's asset version, so the URL is cached for a year and changes with
/// any kit asset (and with it the page's ETag).
pub(super) fn runtime_tag_for(runtime: Runtime) -> String {
    format!(
        "<script type=\"module\" src=\"/static/chassis/{}?v={}\"></script>",
        runtime.file(),
        crate::shell::assets::asset_version()
    )
}

/// `html` with the tags the server owns added: the runtime script when
/// `runtime` is `Some` and the PWA tags that are given. The runtime goes right
/// after the `<head>` opening (ahead of the app's module scripts); the others
/// go before `</head>`, else before `</body>`, else at the end. A tag the page already
/// carries (the runtime file named, `rel="manifest"`, a `theme-color` meta,
/// an `apple-touch-icon`) is skipped, so each is there exactly once, and a
/// page that needs nothing is returned as it is (borrowed).
pub(super) fn with_head_tags(
    html: Cow<'static, [u8]>,
    runtime: Option<Runtime>,
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
    let mut first = String::new();
    let has_runtime = RUNTIME_FILES
        .iter()
        .any(|f| find(&lower, f.as_bytes()).is_some());
    if let Some(runtime) = runtime.filter(|_| !has_runtime) {
        first.push_str(&runtime_tag_for(runtime));
    }
    for tag in pwa.unwrap_or_default() {
        if !tag
            .keys
            .iter()
            .any(|k| find(&compact, k.as_bytes()).is_some())
        {
            tags.push_str(&tag.html);
        }
    }
    // The runtime goes right after the `<head>` opening, so `window.chassisData`
    // exists before any module script of the app runs (module scripts execute in
    // document order). A page without a head gets it with the other tags.
    let head_open = head_open_end(&lower);
    if head_open.is_none() {
        tags.insert_str(0, &first);
        first.clear();
    }
    if tags.is_empty() && first.is_empty() {
        return html;
    }
    let at = find(&lower, b"</head>")
        .or_else(|| find(&lower, b"</body>"))
        .unwrap_or(html.len());
    let start = head_open.filter(|_| !first.is_empty()).unwrap_or(0);
    let mut out = Vec::with_capacity(html.len() + tags.len() + first.len());
    out.extend_from_slice(&html[..start]);
    out.extend_from_slice(first.as_bytes());
    out.extend_from_slice(&html[start..at.max(start)]);
    out.extend_from_slice(tags.as_bytes());
    out.extend_from_slice(&html[at.max(start)..]);
    Cow::Owned(out)
}

/// The position just after the `<head ...>` opening tag, or `None` (no head,
/// or a `<header>` and the like, which only starts with the same letters).
pub(super) fn head_open_end(lower: &[u8]) -> Option<usize> {
    let at = find(lower, b"<head")?;
    let after = *lower.get(at + 5)?;
    if after != b'>' && !after.is_ascii_whitespace() {
        return None;
    }
    let close = lower[at..].iter().position(|b| *b == b'>')?;
    Some(at + close + 1)
}

/// The first position of `needle` in `hay`.
pub(super) fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}
