//! The headers of a browser navigation, and the `TestApp` helpers that act
//! as a same-site or cross-site browser with them.

use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderMap, HeaderValue, ORIGIN, REFERER};

use super::{CROSS_SITE_ORIGIN, TestApp};

fn browser_headers(site: &'static str, origin: &str) -> HeaderMap {
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

impl TestApp {
    /// The headers Chrome sends on a same-origin form submit from a
    /// dashboard page: `Origin` and `Referer` on this app, `Sec-Fetch-Site:
    /// same-origin`, `Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest:
    /// document`, an `Accept` that asks for HTML, and the form
    /// content type. Lay them on a request with `.headers(app.as_browser())`
    /// and add the fields with `.form(&[...])`: the kit must accept it, and
    /// answer a refusal as a page, not JSON (CF-7).
    pub fn as_browser(&self) -> HeaderMap {
        browser_headers("same-origin", &self.base_url())
    }

    /// The same headers from a form on another site (`Sec-Fetch-Site:
    /// cross-site`, a foreign `Origin` and `Referer`): the kit's CSRF rule
    /// must refuse a state-changing request that carries them.
    pub fn as_cross_site_browser(&self) -> HeaderMap {
        browser_headers("cross-site", CROSS_SITE_ORIGIN)
    }
}
