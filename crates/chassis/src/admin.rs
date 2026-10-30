//! K38: talking to ANOTHER service built on this kit, as its operator.
//!
//! [`chassis::testing::TestApp`](crate::testing::TestApp) issues clients on
//! the app it started itself; `chassis clients` does it from a terminal.
//! Neither helps a service whose tests need a real token from a hub it
//! calls — kyu-runner hand-wrote thirty lines for exactly that, and
//! http-switchboard is in the same position. This is that code, once, in
//! the kit.
//!
//! It is part of `core` on purpose: it adds no dependency (the kit already
//! carries an HTTP client) and no server surface, so a headless service
//! reaches it without compiling a dashboard it does not want.
//!
//! ```no_run
//! # async fn example() -> Result<(), chassis::Error> {
//! use chassis::admin::AdminApi;
//!
//! let hub = AdminApi::from_env("https://kyu.example.lan", "KYU_ADMIN_TOKEN")?;
//! let client = hub.issue_client("kyu-runner", &[]).await?;
//! // client.token is what this service now sends as `Authorization: Bearer`.
//! # Ok(())
//! # }
//! ```

use std::collections::BTreeMap;
use std::time::Duration;

use reqwest::Method;
use secrecy::SecretString;
use serde::Deserialize;
use serde_json::Value;

use crate::core::error::{Error, Kind};

mod transport;
use transport::string_field;

/// How long one call may take before it is an error rather than a wait.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);

/// A client of the remote service, as its clients API describes it.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct RemoteClient {
    pub id: String,
    pub name: String,
    pub active: bool,
    #[serde(default)]
    pub issued_at: String,
    #[serde(default)]
    pub revoked_at: Option<String>,
    #[serde(default)]
    pub last_used_at: Option<String>,
    #[serde(default)]
    pub uses: u64,
}

/// A client that was just issued, with the token the remote service showed
/// once. `token` is the value to send as `Authorization: Bearer`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IssuedRemoteClient {
    pub id: String,
    pub name: String,
    pub token: String,
}

/// The clients API of another chassis service, driven with that service's
/// admin token.
pub struct AdminApi {
    base: String,
    token: SecretString,
    client: reqwest::Client,
    timeout: Duration,
}

impl std::fmt::Debug for AdminApi {
    /// Hand-written so the token cannot reach a log or a test failure
    /// message through a derived `Debug` (standing rule 10).
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AdminApi")
            .field("base", &self.base)
            .field("token", &"(secret)")
            .field("timeout", &self.timeout)
            .finish()
    }
}

impl AdminApi {
    /// `base_url` is the service's origin (`https://host[:port]`, no path);
    /// `admin_token` is that service's `<PREFIX>_TOKEN`.
    ///
    /// Prefer [`AdminApi::from_env`]: a token that travels through a
    /// variable never reaches a command line or a process listing
    /// (standing rule 10).
    pub fn new(base_url: &str, admin_token: impl Into<String>) -> Result<Self, Error> {
        let base = base_url.trim_end_matches('/').to_string();
        if !(base.starts_with("http://") || base.starts_with("https://")) {
            return Err(Error::config(
                format!("{base_url} is not an http(s) URL"),
                "pass the service's origin, e.g. https://kyu.example.lan (no path)",
            ));
        }
        let token: String = admin_token.into();
        if token.trim().is_empty() {
            return Err(Error::config(
                "the admin token is empty",
                "pass the value of the other service's <PREFIX>_TOKEN, or use AdminApi::from_env",
            ));
        }
        let client = reqwest::Client::builder()
            // A redirect to /login is the answer to a token the service does
            // not accept; following it would turn a 401 into a 200 page.
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| {
                Error::internal(
                    format!("could not build an HTTP client: {e}"),
                    "this is a TLS/reqwest setup problem on this machine, not the service's",
                )
            })?;
        Ok(Self {
            base,
            token: SecretString::from(token.trim().to_string()),
            client,
            timeout: DEFAULT_TIMEOUT,
        })
    }

    /// [`AdminApi::new`] with the token read from an environment variable,
    /// which is where an operator's secret belongs.
    pub fn from_env(base_url: &str, token_var: &str) -> Result<Self, Error> {
        let value = std::env::var(token_var)
            .ok()
            .filter(|v| !v.trim().is_empty());
        match value {
            Some(v) => Self::new(base_url, v),
            None => Err(Error::config(
                format!("{token_var} is not set, or empty"),
                format!(
                    "export {token_var} with the other service's admin token (the same value its own <PREFIX>_TOKEN holds)"
                ),
            )),
        }
    }

    /// Give every call this long instead of [`DEFAULT_TIMEOUT`].
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Every client the service knows, active and revoked.
    pub async fn list_clients(&self) -> Result<Vec<RemoteClient>, Error> {
        let raw = self.call(Method::GET, "/api/clients", None).await?;
        serde_json::from_value(raw).map_err(|e| {
            Error::dependency(
                format!("the service's client list did not parse: {e}"),
                "is the URL a chassis service with the dashboard feature? `GET /api/clients` answers a JSON array",
            )
        })
    }

    /// Issue a client and read its token back in one go — the two calls
    /// `chassis clients issue` makes. `fields` are the project's own client
    /// form fields, as `--field key=value` passes them.
    pub async fn issue_client(
        &self,
        name: &str,
        fields: &[(&str, &str)],
    ) -> Result<IssuedRemoteClient, Error> {
        let mut body = serde_json::Map::new();
        body.insert("name".to_string(), Value::String(name.to_string()));
        for (k, v) in fields {
            body.insert((*k).to_string(), Value::String((*v).to_string()));
        }
        let view = self
            .call(Method::POST, "/api/clients", Some(Value::Object(body)))
            .await?;
        let id = string_field(&view, "id", "the service issued a client")?;
        let issued_name = view["name"].as_str().unwrap_or(name).to_string();
        Ok(IssuedRemoteClient {
            id: id.clone(),
            name: issued_name,
            token: self.reveal_token(&id).await?,
        })
    }

    /// The token of an existing client; the kit shows it as often as an
    /// operator asks.
    pub async fn reveal_token(&self, id: &str) -> Result<String, Error> {
        let reveal = self
            .call(Method::GET, &format!("/api/clients/{id}/token"), None)
            .await?;
        string_field(&reveal, "token", "the service's reveal answer")
    }

    /// Revoke a client: its token stops working the same second, the row
    /// stays.
    pub async fn revoke_client(&self, id: &str) -> Result<(), Error> {
        self.call(Method::POST, &format!("/api/clients/{id}/revoke"), None)
            .await
            .map(|_| ())
    }

    /// Delete a client: the row goes too.
    pub async fn delete_client(&self, id: &str) -> Result<(), Error> {
        self.call(Method::DELETE, &format!("/api/clients/{id}"), None)
            .await
            .map(|_| ())
    }

    /// The id of the client called `name`, when there is exactly one; a
    /// test that issues by name and then revokes needs it.
    pub async fn client_id(&self, name: &str) -> Result<String, Error> {
        let clients = self.list_clients().await?;
        let mut hits = clients.into_iter().filter(|c| c.name == name);
        match (hits.next(), hits.next()) {
            (Some(one), None) => Ok(one.id),
            (Some(_), Some(_)) => Err(Error::invalid(
                format!("more than one client is called {name}"),
                "address it by id: list_clients() carries both",
            )),
            _ => Err(Error::new(
                Kind::NotFound,
                format!("no client is called {name}"),
                "issue it first with issue_client, or list_clients() to see the names",
            )),
        }
    }
}

/// `--field key=value` pairs as `issue_client` takes them; the shape a
/// project's own client form fields arrive in.
pub fn fields_from(pairs: &BTreeMap<String, String>) -> Vec<(&str, &str)> {
    pairs
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect()
}
