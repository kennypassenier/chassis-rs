//! The kp-themes import map in a web app's HTML pages (see
//! `shell::assets::kp_map` for what the map does and cannot do).
//!
//! Applied after the runtime tag is in: the map goes right after `<head>`,
//! ahead of every module script, and the response policy gains the map's
//! `sha256-…` source. A page that cannot take it is returned as it is:
//! it carries an import map of its own (two maps do not merge), has no
//! `<head>`, or the app's policy has no `script-src 'self'` (said at start by
//! `WebApp::validate`).

use std::borrow::Cow;
use std::sync::atomic::{AtomicBool, Ordering};

use super::inject::{find, head_open_end};
use crate::shell::assets::{kp_map, kp_tags};

/// `html` with the map and boot rewrite, and the policy to send with it;
/// `None` for the policy means the page was left unmapped.
pub(super) fn apply(html: Cow<'static, [u8]>, csp: &str) -> (Cow<'static, [u8]>, Option<String>) {
    let lower = html.to_ascii_lowercase();
    if find(&lower, b"importmap").is_some() {
        warn_own_map_once();
        return (html, None);
    }
    let (Some(csp), Some(at)) = (kp_map::csp_with_hash(csp), head_open_end(&lower)) else {
        return (html, None);
    };
    let html = match kp_tags::rewrite_script_srcs(&html) {
        Some(rewritten) => Cow::Owned(rewritten),
        None => html,
    };
    // The rewrite keeps the head's opening where it was only when nothing
    // before it changed length, so the position is looked up again.
    let at = head_open_end(&html.to_ascii_lowercase()).unwrap_or(at);
    let tag = kp_map::tag();
    let mut out = Vec::with_capacity(html.len() + tag.len());
    out.extend_from_slice(&html[..at]);
    out.extend_from_slice(tag.as_bytes());
    out.extend_from_slice(&html[at..]);
    (Cow::Owned(out), Some(csp))
}

/// A page with its own import map is the app's decision; say so once per
/// process instead of on every request.
fn warn_own_map_once() {
    static SAID: AtomicBool = AtomicBool::new(false);
    if !SAID.swap(true, Ordering::Relaxed) {
        tracing::warn!(
            "web app: a page carries its own import map, so the kp-themes map is not injected; \
             import either the bundle or the split entries there, never both"
        );
    }
}
