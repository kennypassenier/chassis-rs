//! One kp-themes runtime per page, for `<script src>` (kyu C1, Almanac 39).
//!
//! The import map ([`super::kp_map`]) covers every import, but a browser
//! never resolves a `<script src>` through it. A tag naming the bundle
//! (`/static/kp/dist/kp-themes.min.js`, with or without an app's own `?v=`)
//! or a split entry (`/static/kp/dist/js/<entry>.js`) therefore loaded a
//! second module instance next to the mapped one: two copies of kp-themes'
//! state on one page. Every such tag on a page the kit serves is rewritten to
//! the URL the map would give: the bundle and `index.js` to the hashed
//! bundle, any other entry to its facade. The page then holds one runtime,
//! and the log says once per tag which file to clean up.

use std::collections::HashSet;
use std::sync::Mutex;

use super::{BUNDLE_FACADE_PREFIX, KP_BUNDLE_NAME, SPLIT_PREFIX, kp_map};

/// `html` with every kp-themes `<script src>` pointed where the import map
/// points; `None` when no tag needed it (the caller keeps its bytes).
pub(crate) fn rewrite_script_srcs(html: &[u8]) -> Option<Vec<u8>> {
    let lower = html.to_ascii_lowercase();
    let mut out = Vec::with_capacity(html.len());
    let (mut copied, mut from, mut changed) = (0, 0, false);
    while let Some(at) = find(&lower[from..], b"src=").map(|i| i + from) {
        from = at + 4;
        let Some(&quote) = html.get(from).filter(|q| matches!(q, b'"' | b'\'')) else {
            continue;
        };
        let start = from + 1;
        let Some(len) = html[start..].iter().position(|b| *b == quote) else {
            break;
        };
        let value = String::from_utf8_lossy(&html[start..start + len]);
        if let Some(to) = target(&value) {
            out.extend_from_slice(&html[copied..start]);
            out.extend_from_slice(to.as_bytes());
            copied = start + len;
            changed = true;
            warn_once(&value, &to);
        }
        from = start + len;
    }
    out.extend_from_slice(&html[copied..]);
    changed.then_some(out)
}

/// Where a `src` value must point, or `None` when it is not kp-themes' or
/// already right.
fn target(value: &str) -> Option<String> {
    let path = value.split(['?', '#']).next().unwrap_or(value);
    let bundle = format!("/static/{KP_BUNDLE_NAME}");
    if path == bundle || path == format!("{SPLIT_PREFIX}index.js") {
        let url = kp_map::bundle_url();
        return (value != url).then(|| url.to_string());
    }
    let entry = value.strip_prefix(SPLIT_PREFIX)?;
    Some(format!("{BUNDLE_FACADE_PREFIX}{entry}"))
}

/// The first position of `needle` in `hay`.
fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}

/// Each distinct tag is reported once per process, not per request.
fn warn_once(from: &str, to: &str) {
    static SAID: Mutex<Option<HashSet<String>>> = Mutex::new(None);
    let mut said = SAID.lock().unwrap_or_else(|e| e.into_inner());
    if said
        .get_or_insert_with(HashSet::new)
        .insert(from.to_string())
    {
        tracing::warn!(
            from,
            to,
            "a page loads kp-themes by <script src>, which the import map cannot reach; the kit rewrote it so the page keeps one kp-themes runtime. What now: drop the tag (the kit's pages boot kp-themes themselves) or import the module from a script instead"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rewrite(html: &str) -> String {
        rewrite_script_srcs(html.as_bytes())
            .map_or_else(|| html.to_string(), |v| String::from_utf8(v).unwrap())
    }

    #[test]
    fn the_bundle_by_tag_becomes_the_mapped_bundle() {
        let url = kp_map::bundle_url();
        for tag in [
            r#"<script type="module" src="/static/kp/dist/kp-themes.min.js"></script>"#,
            r#"<script type="module" src='/static/kp/dist/kp-themes.min.js?v=app1'></script>"#,
            r#"<script type="module" SRC="/static/kp/dist/js/index.js"></script>"#,
        ] {
            let out = rewrite(tag);
            assert!(out.contains(url), "{tag} -> {out}");
            assert!(!out.contains("app1") && !out.contains("dist/js/"), "{out}");
        }
    }

    #[test]
    fn a_split_entry_by_tag_becomes_its_facade() {
        let out =
            rewrite(r#"<script type="module" src="/static/kp/dist/js/dialog.js?v=2"></script>"#);
        assert_eq!(
            out,
            r#"<script type="module" src="/static/kp/dist/bundle/dialog.js?v=2"></script>"#
        );
    }

    #[test]
    fn other_tags_and_the_right_url_are_left_alone() {
        let url = kp_map::bundle_url();
        for html in [
            r#"<script src="/static/chassis.js?v=1"></script><img src="/pwa/icon-192.png">"#
                .to_string(),
            format!(r#"<script type="module" src="{url}"></script>"#),
            r#"<script type="module" src="/static/kp/dist/bundle/auto.js"></script>"#.to_string(),
        ] {
            assert!(rewrite_script_srcs(html.as_bytes()).is_none(), "{html}");
        }
    }
}
