//! The headers of a browser navigation, for the helpers that act as a
//! same-site or cross-site browser.

use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderMap, HeaderValue, ORIGIN, REFERER};

pub(super) fn browser_headers(site: &'static str, origin: &str) -> HeaderMap {
    let value = |s: &str| {
        HeaderValue::from_str(s).unwrap_or_else(|e| panic!("header value `{s}` is not ASCII: {e}"))
    };
    let mut headers = HeaderMap::new();
    headers.insert(ORIGIN, value(origin));
    headers.insert(REFERER, value(&format!("{origin}/")));
    headers.insert("sec-fetch-site", HeaderValue::from_static(site));
    headers.insert("sec-fetch-mode", HeaderValue::from_static("navigate"));
    headers.insert("sec-fetch-dest", HeaderValue::from_static("document"));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("text/html,application/xhtml+xml"),
    );
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/x-www-form-urlencoded"),
    );
    headers
}
