//! The service worker as the server hands it out: the pure logic and the
//! browser part joined behind the two version constants, the offline page
//! and the hash that ties a cache to the web app's own build.

use super::super::Source;

const LOGIC: &str = include_str!("sw-logic.js");
const CORE: &str = include_str!("sw.js");
/// habits-push-1: the `push` and `notificationclick` handlers, appended only
/// in a build with the `push` feature (a worker without it has no handlers).
#[cfg(feature = "push")]
const PUSH_LOGIC: &str = include_str!("sw-push-logic.js");
#[cfg(feature = "push")]
const PUSH_CORE: &str = include_str!("sw-push.js");
#[cfg(not(feature = "push"))]
const PUSH_LOGIC: &str = "";
#[cfg(not(feature = "push"))]
const PUSH_CORE: &str = "";

/// The offline page's retry script, served at `/pwa/offline.js`.
pub(super) const OFFLINE_JS: &str = include_str!("offline.js");

/// `sw.js`: the two versions as constants, then the logic, then the worker,
/// then (with the `push` feature) the push logic and its handlers.
/// The kit version is the assets' `?v=` (precache URLs use it); the app
/// version changes with any file of the web app. Either one moving changes
/// the bytes, which is what makes the browser install the new worker.
pub(super) fn sw_source(kit_version: &str, app_version: &str) -> String {
    format!(
        "const KIT_VERSION = {kit:?};\nconst APP_VERSION = {app:?};\n{LOGIC}{CORE}{PUSH_LOGIC}{PUSH_CORE}",
        kit = kit_version,
        app = app_version
    )
}

/// The page shown instead of a page that cannot be fetched.
pub(super) fn offline_page(kit_version: &str, theme_color: &str) -> String {
    format!(
        "<!doctype html>\n<html lang=\"en\" data-theme=\"formal\"><head><meta charset=\"utf-8\">\n\
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n\
<meta name=\"theme-color\" content=\"{theme_color}\"><title>Offline</title>\n\
<link rel=\"stylesheet\" href=\"/static/kp/css/fonts.css?v={kit_version}\">\n\
<link rel=\"stylesheet\" href=\"/static/kp/dist/kp-themes.css?v={kit_version}\">\n\
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center}}\
div.wrap{{max-width:28rem;width:100%;padding:16px;box-sizing:border-box}}</style></head><body>\n\
<div class=\"wrap\"><main class=\"kp-card\"><h1 class=\"kp-card__title\">You are offline</h1>\n\
<p>This page needs a connection. It tries again by itself as soon as you are back online.</p>\n\
<p><button type=\"button\" class=\"kp-button kp-button--primary\" id=\"retry\">Try again now</button></p></main>\n\
<script src=\"/pwa/offline.js\"></script></body></html>\n"
    )
}

/// The web app's build hash: over the embedded files, or over the names,
/// sizes and modification times of a directory (read on each call, because
/// a directory changes while a developer edits it).
pub(super) async fn app_version(source: &Source) -> String {
    match source {
        Source::Embedded(files) => {
            crate::shell::assets::fnv_version(files.iter().map(|(p, b)| (*p, *b)))
        }
        Source::Dir(root) => {
            let root = root.clone();
            tokio::task::spawn_blocking(move || dir_version(&root))
                .await
                .unwrap_or_default()
        }
    }
}

/// Up to this many files are looked at; a web app is a handful of files.
const MAX_FILES: usize = 5000;

fn dir_version(root: &std::path::Path) -> String {
    let mut entries = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(read) = std::fs::read_dir(&dir) else {
            continue;
        };
        for e in read.flatten() {
            let Ok(meta) = e.metadata() else { continue };
            if meta.is_dir() {
                stack.push(e.path());
            } else if entries.len() < MAX_FILES {
                let stamp = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(0, |d| d.as_nanos());
                let rel = e
                    .path()
                    .strip_prefix(root)
                    .unwrap_or(&e.path())
                    .display()
                    .to_string();
                entries.push(format!("{rel}:{}:{stamp}", meta.len()));
            }
        }
    }
    entries.sort();
    let joined = entries.join("\n");
    crate::shell::assets::fnv_version(std::iter::once(("", joined.as_bytes())))
}
