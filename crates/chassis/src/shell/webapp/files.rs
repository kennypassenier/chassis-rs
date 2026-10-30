//! Reading an asset (embedded or from a directory, never outside its root)
//! and mapping its extension to a content type.

use std::borrow::Cow;

use super::Source;

pub(super) fn content_type(path: &str) -> &'static str {
    match path.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()) {
        Some(e) => match e.as_str() {
            "html" | "htm" => "text/html; charset=utf-8",
            "js" | "mjs" => "text/javascript; charset=utf-8",
            "css" => "text/css; charset=utf-8",
            "json" | "map" => "application/json",
            "svg" => "image/svg+xml",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "ico" => "image/x-icon",
            "woff2" => "font/woff2",
            "woff" => "font/woff",
            "txt" => "text/plain; charset=utf-8",
            "wasm" => "application/wasm",
            _ => "application/octet-stream",
        },
        None => "application/octet-stream",
    }
}

pub(super) async fn read(source: &Source, rel: &str) -> Option<Cow<'static, [u8]>> {
    match source {
        Source::Embedded(files) => files
            .iter()
            .find(|(p, _)| *p == rel)
            .map(|(_, b)| Cow::Borrowed(*b)),
        Source::Dir(root) => {
            let path = root.join(rel);
            // Symlinks may point anywhere; only what resolves inside the
            // root is served.
            let (canon, root) = (
                tokio::fs::canonicalize(&path).await.ok()?,
                tokio::fs::canonicalize(root).await.ok()?,
            );
            if !canon.starts_with(&root) || !canon.is_file() {
                return None;
            }
            tokio::fs::read(&canon).await.ok().map(Cow::Owned)
        }
    }
}
