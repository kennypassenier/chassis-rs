//! The request helpers of `TestApp`: a request builder with or without the
//! session, page and JSON shortcuts, and the senders that panic with the status
//! on a transport failure.

use super::TestApp;
use reqwest::Method;
use reqwest::header::ACCEPT;

impl TestApp {
    /// A request as the admin's browser or script: the session cookie is
    /// attached once [`TestApp::login`] ran, redirects are not followed,
    /// and the timeout applies. Finish it with reqwest's `.send().await`,
    /// or hand it to [`TestApp::send_json`] / [`TestApp::send_text`].
    pub fn request(&self, method: Method, path: &str) -> reqwest::RequestBuilder {
        let mut request = self
            .client
            .request(method, self.url(path))
            .timeout(self.timeout);
        if let Some(cookie) = &self.session {
            request = request.header(reqwest::header::COOKIE, cookie);
        }
        request
    }

    /// A request as a script or another service: `Authorization: Bearer
    /// <token>`, no cookie. `token` is what [`TestApp::issue_client`]
    /// returned, or [`TestApp::token`] for the admin's own bearer.
    pub fn bearer(&self, method: Method, path: &str, token: &str) -> reqwest::RequestBuilder {
        self.client
            .request(method, self.url(path))
            .timeout(self.timeout)
            .bearer_auth(token)
    }

    /// Fetch a page the way a browser would (`Accept: text/html`), as the
    /// admin when logged in: `(status, html)`.
    pub async fn page(&self, path: &str) -> (u16, String) {
        Self::send_text(
            self.request(Method::GET, path)
                .header(ACCEPT, "text/html,application/xhtml+xml"),
        )
        .await
    }

    /// One JSON call as the admin: `body` is sent as JSON when given;
    /// the answer is `(status, json)`, where an empty body reads as
    /// `Value::Null` and a body that is not JSON as `Value::String`.
    pub async fn json(
        &self,
        method: Method,
        path: &str,
        body: Option<serde_json::Value>,
    ) -> (u16, serde_json::Value) {
        let mut request = self.request(method, path);
        if let Some(body) = body {
            request = request.json(&body);
        }
        Self::send_json(request).await
    }

    /// `GET path` as the admin → `(status, json)`.
    pub async fn get_json(&self, path: &str) -> (u16, serde_json::Value) {
        self.json(Method::GET, path, None).await
    }

    /// `POST path` with a JSON body as the admin → `(status, json)`.
    pub async fn post_json(&self, path: &str, body: serde_json::Value) -> (u16, serde_json::Value) {
        self.json(Method::POST, path, Some(body)).await
    }

    /// `DELETE path` as the admin → `(status, json)`; a `204` reads as
    /// `(204, Value::Null)`.
    pub async fn delete(&self, path: &str) -> (u16, serde_json::Value) {
        self.json(Method::DELETE, path, None).await
    }

    /// Send any request built with [`TestApp::request`] or
    /// [`TestApp::bearer`] and read `(status, json)` the way
    /// [`TestApp::json`] does. Panics when no answer arrives at all.
    pub async fn send_json(request: reqwest::RequestBuilder) -> (u16, serde_json::Value) {
        let (status, text) = Self::send_text(request).await;
        let json = if text.trim().is_empty() {
            serde_json::Value::Null
        } else {
            serde_json::from_str(&text).unwrap_or(serde_json::Value::String(text))
        };
        (status, json)
    }

    /// Send any request and read `(status, body as text)`. Panics when no
    /// answer arrives at all (a dead server, a refused connection).
    pub async fn send_text(request: reqwest::RequestBuilder) -> (u16, String) {
        let response = request.send().await.unwrap_or_else(|e| {
            panic!(
                "the test app did not answer: {e}. What now: the app was stopped or never started; check the order of shutdown() and this request"
            )
        });
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        (status, text)
    }
}
