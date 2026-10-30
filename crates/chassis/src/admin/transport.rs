//! The HTTP call of `AdminApi` and the mapping of its failures to the
//! kit's errors: transport faults, the other service's refusals and a
//! reply that lacks a field. Its own module so the public methods in
//! `admin.rs` read as the API, not as `reqwest` plumbing.

use reqwest::{Method, StatusCode};
use secrecy::ExposeSecret;
use serde_json::Value;

use super::AdminApi;
use crate::core::error::{Error, Kind};

impl AdminApi {
    pub(super) async fn call(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value, Error> {
        let url = format!("{}{path}", self.base);
        let mut request = self
            .client
            .request(method, &url)
            .timeout(self.timeout)
            .bearer_auth(self.token.expose_secret());
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request.send().await.map_err(|e| self.transport(&url, &e))?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if status.is_success() {
            if text.trim().is_empty() {
                return Ok(Value::Null);
            }
            return serde_json::from_str(&text).map_err(|e| {
                Error::dependency(
                    format!("{url} answered {status} with a body that is not JSON: {e}"),
                    "is the URL the service's own origin, and not a proxy or a login page?",
                )
            });
        }
        Err(self.refusal(&url, status, &text))
    }

    /// The service's own message when it has one — its errors already carry
    /// a remedy (rule 11), and repeating it beats inventing a second one.
    fn refusal(&self, url: &str, status: StatusCode, body: &str) -> Error {
        let parsed: Option<Value> = serde_json::from_str(body).ok();
        let message = parsed
            .as_ref()
            .and_then(|v| v["error"].as_str().or_else(|| v["message"].as_str()))
            .map(str::to_string);
        let remedy = parsed
            .as_ref()
            .and_then(|v| v["remedy"].as_str())
            .map(str::to_string);
        let kind = match status {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Kind::Unauthorized,
            StatusCode::NOT_FOUND => Kind::NotFound,
            StatusCode::TOO_MANY_REQUESTS | StatusCode::SERVICE_UNAVAILABLE => Kind::Overloaded,
            s if s.is_client_error() => Kind::Invalid,
            _ => Kind::Dependency,
        };
        let default_remedy = match kind {
            Kind::Unauthorized => {
                "is the token the OTHER service's admin token? it is the value of its own <PREFIX>_TOKEN"
            }
            Kind::NotFound => "check the client id; list_clients() carries the current ones",
            _ => "check the service's own log: it logs the same refusal with its reason",
        };
        Error::new(
            kind,
            message.unwrap_or_else(|| format!("{url} answered {status}")),
            remedy.unwrap_or_else(|| default_remedy.to_string()),
        )
    }

    fn transport(&self, url: &str, e: &reqwest::Error) -> Error {
        let what = if e.is_timeout() {
            format!("{url} did not answer within {:?}", self.timeout)
        } else if e.is_connect() {
            format!("could not connect to {url}")
        } else {
            format!("the request to {url} failed: {e}")
        };
        Error::dependency(
            what,
            "is the service running and reachable from here? `curl -sS <url>/healthz` answers when it is",
        )
    }
}

pub(super) fn string_field(value: &Value, field: &str, what: &str) -> Result<String, Error> {
    value[field].as_str().map(str::to_string).ok_or_else(|| {
        Error::dependency(
            format!("{what} carries no `{field}` field"),
            "is the other service a chassis service of 1.0.0 or later? compare its /healthz",
        )
    })
}
