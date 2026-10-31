//! gzip for the kit's static responses and the web apps' files.
//!
//! kp-themes ships one 1.9 MB module (557 KB gzipped) and the kit's CSS
//! bundle is 4.4 MB, so an uncompressed cold load is mostly redundant bytes.
//! This module is the one place that decides what is compressed:
//!
//! - only text types (js, css, html, json, svg); fonts (woff2) and images are
//!   already compressed and are sent as they are,
//! - only when the client asks (`Accept-Encoding: gzip`; the layer also adds
//!   `Vary: Accept-Encoding`),
//! - never the kit's HTML pages: they carry per-session tokens, which is what
//!   compression side channels (BREACH) feed on. The layer is mounted on the
//!   static route and on the web app's files only.
//!
//! ETag stays correct: the handlers compute one validator from the raw bytes.
//! A compressed answer carries it as a weak validator (`W/"…"`, the bytes
//! differ per encoding) and [`crate::shell::assets::etag_matches`] accepts either form, so a
//! browser's revalidation still ends in a 304.

use axum::Router;
use axum::http::{HeaderMap, HeaderValue, header};
use axum::middleware::map_response;
use axum::response::Response;
use tower_http::compression::CompressionLayer;
use tower_http::compression::predicate::{Predicate, SizeAbove};

/// Smaller bodies cost more in headers and CPU than they save.
const MIN_COMPRESSIBLE_BYTES: u64 = 256;

/// Content types worth compressing.
fn compressible(content_type: &str) -> bool {
    let t = content_type.split(';').next().unwrap_or("").trim();
    matches!(
        t,
        "text/javascript"
            | "application/javascript"
            | "text/css"
            | "text/html"
            | "application/json"
            | "image/svg+xml"
            | "application/manifest+json"
    )
}

/// `router` with gzip on its compressible answers.
pub(crate) fn compressed<S: Clone + Send + Sync + 'static>(router: Router<S>) -> Router<S> {
    let by_type = |_: axum::http::StatusCode,
                   _: axum::http::Version,
                   headers: &HeaderMap,
                   _: &axum::http::Extensions| {
        headers
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(compressible)
    };
    let layer = CompressionLayer::new()
        .gzip(true)
        .no_br()
        .no_deflate()
        .no_zstd()
        .compress_when(SizeAbove::new(MIN_COMPRESSIBLE_BYTES).and(by_type));
    // Outside the compression layer, so it sees the finished response.
    router.layer(layer).layer(map_response(weaken_etag))
}

/// A compressed body is a different representation of the same file: its
/// ETag becomes weak.
async fn weaken_etag(mut res: Response) -> Response {
    if !res.headers().contains_key(header::CONTENT_ENCODING) {
        return res;
    }
    let weak = res
        .headers()
        .get(header::ETAG)
        .and_then(|v| v.to_str().ok())
        .filter(|v| !v.starts_with("W/"))
        .and_then(|v| HeaderValue::from_str(&format!("W/{v}")).ok());
    if let Some(weak) = weak {
        res.headers_mut().insert(header::ETAG, weak);
    }
    res
}
