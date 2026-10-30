//! The HTTP side of `chassis clients`: one blocking client, the base URL and
//! the token, and the mapping from the service's answers to errors with
//! remedies. Its own module because it is the only code that touches the
//! network.

use std::collections::BTreeMap;
use std::time::Duration;

use chassis::{Error, Kind};
use reqwest::blocking::Client;
use reqwest::{Method, StatusCode};
use secrecy::{ExposeSecret, SecretString};
use serde_json::Value;

use super::rows::ClientRow;
use super::token::token_of;
use super::usage;

/// from the service's answers to errors with remedies.
pub(super) struct Api {
    http: Client,
    base: String,
    var: String,
    token: SecretString,
}

impl Api {
    pub(super) fn new(
        url: &str,
        var: String,
        token: SecretString,
        timeout: Duration,
    ) -> Result<Self, Error> {
        let base = url.trim_end_matches('/').to_string();
        if !(base.starts_with("http://") || base.starts_with("https://")) {
            usage(format!(
                "--url `{url}` must start with http:// or https://. What now: pass the service's base URL, e.g. --url http://10.10.10.9:8080"
            ));
        }
        // No redirects: a kit older than this command answers a wrong
        // bearer with a redirect to /login, and following it would turn a
        // 401 into a 200 login page.
        let http = Client::builder()
            .timeout(timeout)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| {
                Error::internal(
                    format!("could not build the HTTP client: {e}"),
                    "report this with the exact command",
                )
            })?;
        Ok(Api {
            http,
            base,
            var,
            token,
        })
    }

    pub(super) fn list(&self) -> Result<(Value, Vec<ClientRow>), Error> {
        let raw = self.call(Method::GET, "/api/clients", None)?;
        let rows: Vec<ClientRow> = serde_json::from_value(raw.clone()).map_err(|e| {
            Error::dependency(
                format!("the service's client list is not in the kit's shape: {e}"),
                format!(
                    "is {} a chassis service with the dashboard feature? `GET /api/clients` should answer a JSON array",
                    self.base
                ),
            )
        })?;
        Ok((raw, rows))
    }

    pub(super) fn issue(
        &self,
        name: &str,
        fields: &BTreeMap<String, String>,
    ) -> Result<(Value, SecretString), Error> {
        let mut body = serde_json::Map::new();
        body.insert("name".to_string(), Value::String(name.to_string()));
        for (k, v) in fields {
            body.insert(k.clone(), Value::String(v.clone()));
        }
        let view = self.call(Method::POST, "/api/clients", Some(Value::Object(body)))?;
        let id = view["id"].as_str().ok_or_else(|| {
            Error::dependency(
                "the service issued a client but its answer carries no `id`",
                "list the clients with `chassis clients list`; the token can be read with `chassis clients reveal <NAME>`",
            )
        })?;
        let token = token_of(&self.reveal(id)?)?;
        Ok((view, SecretString::from(token)))
    }

    pub(super) fn reissue(&self, id: &str) -> Result<(Value, SecretString), Error> {
        let view = self.post(&format!("/api/clients/{id}/reissue"))?;
        let token = token_of(&self.reveal(id)?)?;
        Ok((view, SecretString::from(token)))
    }

    pub(super) fn reveal(&self, id: &str) -> Result<Value, Error> {
        self.call(Method::GET, &format!("/api/clients/{id}/token"), None)
    }

    pub(super) fn post(&self, path: &str) -> Result<Value, Error> {
        self.call(Method::POST, path, None)
    }

    pub(super) fn delete(&self, id: &str) -> Result<(), Error> {
        self.call(Method::DELETE, &format!("/api/clients/{id}"), None)
            .map(|_| ())
    }

    /// One request; a 2xx answer as JSON (`null` for an empty body),
    /// anything else as an error whose remedy fits the status.
    pub(super) fn call(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value, Error> {
        let url = format!("{}{}", self.base, path);
        let mut req = self
            .http
            .request(method.clone(), &url)
            .bearer_auth(self.token.expose_secret());
        if let Some(b) = body {
            req = req.json(&b);
        }
        let res = req.send().map_err(|e| self.transport_error(&e))?;
        let status = res.status();
        let location = res
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let text = res.text().unwrap_or_default();
        if status.is_success() {
            if text.trim().is_empty() {
                return Ok(Value::Null);
            }
            return serde_json::from_str(&text).map_err(|e| {
                Error::dependency(
                    format!("{method} {path} answered {status} but not JSON: {e}"),
                    format!("is {} a chassis service? compare its /healthz", self.base),
                )
            });
        }
        let api_error: Option<(String, String)> =
            serde_json::from_str::<Value>(&text).ok().and_then(|v| {
                Some((
                    v["error"].as_str()?.to_string(),
                    v["remedy"].as_str()?.to_string(),
                ))
            });
        // A redirect to the login page is what a kit before 1.8.0 answers
        // a wrong bearer with: the same fact as a 401.
        if status == StatusCode::UNAUTHORIZED
            || (status.is_redirection() && location.contains("/login"))
        {
            return Err(Error::new(
                Kind::Unauthorized,
                format!("{} refused the token in ${}", self.base, self.var),
                format!(
                    "the token in ${} is not this service's admin token: it must be the <PREFIX>_TOKEN from the environment file of the service at {}, not a client token; check that --url points at the intended service",
                    self.var, self.base
                ),
            ));
        }
        if status == StatusCode::NOT_FOUND {
            return Err(match api_error {
                Some((message, _)) if path != "/api/clients" => Error::new(
                    Kind::NotFound,
                    message,
                    "the client is gone since the list was read; list them again with `chassis clients list`",
                ),
                _ => Error::new(
                    Kind::NotFound,
                    format!("{} has no {path}", self.base),
                    "is --url the service's base URL (no path), and is the dashboard feature compiled into it? compare its /healthz",
                ),
            });
        }
        match api_error {
            // The service's own refusal (a duplicate name, a project hook
            // saying no) already carries its remedy.
            Some((message, remedy)) => Err(Error::new(kind_of(status), message, remedy)),
            None => Err(Error::dependency(
                format!(
                    "{method} {path} answered {status}{}",
                    if text.trim().is_empty() {
                        String::new()
                    } else {
                        format!(": {}", text.trim())
                    }
                ),
                format!(
                    "read the service's log at {}; compare its /healthz",
                    self.base
                ),
            )),
        }
    }

    pub(super) fn transport_error(&self, e: &reqwest::Error) -> Error {
        if e.is_timeout() {
            return Error::dependency(
                format!("{} did not answer within the timeout", self.base),
                "is the service healthy? check its /healthz, or raise --timeout-secs",
            );
        }
        // The chain carries the cause (`Connection refused`, a DNS failure);
        // reqwest's top line only names the URL.
        let mut chain = e.to_string();
        let mut source = std::error::Error::source(e);
        while let Some(s) = source {
            chain.push_str(": ");
            chain.push_str(&s.to_string());
            source = s.source();
        }
        Error::dependency(
            format!("could not reach {}: {chain}", self.base),
            format!(
                "is the service running at {}? compare the address with its `--print-config` (the listen knob) and the reverse proxy in front of it",
                self.base
            ),
        )
    }
}

pub(super) fn kind_of(status: StatusCode) -> Kind {
    match status.as_u16() {
        400 => Kind::Invalid,
        401 | 403 => Kind::Unauthorized,
        404 => Kind::NotFound,
        429 | 503 => Kind::Overloaded,
        _ => Kind::Dependency,
    }
}
