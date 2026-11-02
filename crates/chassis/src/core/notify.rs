//! The pure half of notifications (K22, AR10): which events exist, what
//! a webhook entry in the config file means, and how an event becomes a
//! request body. Sending is `shell::notify`'s job.
//!
//! Configuration lives in the TOML file as repeated tables:
//!
//! ```toml
//! [[notify.webhook]]
//! events = ["update.*", "health.degraded"]
//! url = "http://10.10.10.9:8080/t/ops.alerts"        # a kyu topic is just a webhook
//! method = "POST"                                     # default
//! headers = { "Authorization" = "Bearer ${INBOX_KYU_TOKEN}" }
//! body = '{"service": "{{ service }}", "event": "{{ kind }}", "detail": {{ detail | tojson }}}'
//! fallback = "http://10.10.10.5:8123/api/webhook/${INBOX_HA_HOOK}"
//! ```
//!
//! `${VAR}` in `url`, `headers` and `fallback` resolves from the
//! environment (fail-closed) so credentials never sit in the file.
//! `events` are glob-ish: an exact name, or `prefix.*`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::core::config::expand;
use crate::core::error::Error;
use crate::core::notify_link::{Link, Wire, body_json};

/// The kit's own events. Projects add their own names freely (they are
/// strings on the wire); these are the ones the kit emits.
pub const KIT_EVENTS: &[&str] = &[
    "service.started",
    "update.installed",
    "update.ok",
    "update.failed",
    "update.rolled_back",
    "update.held",
    "health.degraded",
    "health.recovered",
];

/// Whether the kit itself emits `kind` (one of [`KIT_EVENTS`]); everything
/// else is an event of the app. Decides which target gets the event.
pub fn is_kit_event(kind: &str) -> bool {
    KIT_EVENTS.contains(&kind)
}

/// One thing that happened.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Event {
    pub service: String,
    pub kind: String,
    pub at: String,
    pub version: String,
    pub detail: String,
}

/// One `[[notify.webhook]]` table, as written.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct WebhookSpec {
    pub events: Vec<String>,
    pub url: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    /// minijinja template over the event's fields; default = the event as JSON.
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub fallback: Option<String>,
}

fn default_method() -> String {
    "POST".to_string()
}

/// The same entry with `${VAR}` resolved and the method validated.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Webhook {
    pub events: Vec<String>,
    pub url: String,
    pub method: String,
    pub headers: BTreeMap<String, String>,
    pub body: Option<String>,
    pub fallback: Option<String>,
}

impl WebhookSpec {
    pub fn resolve(&self, env: &BTreeMap<String, String>, index: usize) -> Result<Webhook, Error> {
        let where_ = format!("notify.webhook[{index}]");
        let missing = |name: String| {
            Error::config(
                format!("{where_} references ${{{name}}}, which is not set"),
                format!(
                    "export {name}=<value> in the environment file; secrets never go in the config file"
                ),
            )
        };
        let url = expand(&self.url, env).map_err(missing)?;
        let fallback = match &self.fallback {
            Some(f) => Some(expand(f, env).map_err(missing)?),
            None => None,
        };
        let mut headers = BTreeMap::new();
        for (k, v) in &self.headers {
            headers.insert(k.clone(), expand(v, env).map_err(missing)?);
        }
        let method = self.method.to_ascii_uppercase();
        if !matches!(method.as_str(), "POST" | "PUT" | "PATCH") {
            return Err(Error::config(
                format!(
                    "{where_} has method `{}`; only POST, PUT and PATCH carry a body",
                    self.method
                ),
                "use POST",
            ));
        }
        if self.events.is_empty() {
            return Err(Error::config(
                format!("{where_} lists no events"),
                "set events = [\"update.*\"] or name the events it should receive",
            ));
        }
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err(Error::config(
                format!("{where_} url `{url}` is not http(s)"),
                "webhooks are HTTP; a kyu topic is http://<hub>/t/<topic>",
            ));
        }
        Ok(Webhook {
            events: self.events.clone(),
            url,
            method,
            headers,
            body: self.body.clone(),
            fallback,
        })
    }
}

impl Webhook {
    /// Exact name or `prefix.*`.
    pub fn wants(&self, kind: &str) -> bool {
        self.events.iter().any(|pat| {
            if let Some(prefix) = pat.strip_suffix(".*") {
                kind.starts_with(prefix)
                    && kind.len() > prefix.len()
                    && kind.as_bytes()[prefix.len()] == b'.'
            } else {
                pat == kind
            }
        })
    }

    /// The request body for `event`: the template, or the event as JSON.
    pub fn render_body(&self, event: &Event) -> Result<String, Error> {
        self.render_body_linked(event, None)
    }

    /// [`Webhook::render_body`] for an event with a title and link. The
    /// default body gains `"title"` and `"url"` (only those that are set);
    /// a custom template sees them as the variables `title` and `url`, which
    /// are left out of the context when unset, so `{% if url %}` works.
    pub fn render_body_linked(&self, event: &Event, link: Option<&Link>) -> Result<String, Error> {
        let Some(tpl) = &self.body else {
            return Ok(body_json(event, link));
        };
        let mut env = minijinja::Environment::new();
        env.add_template("body", tpl).map_err(|e| {
            Error::config(
                format!("webhook body template does not parse: {e}"),
                "fix the template in the config file",
            )
        })?;
        let ctx = minijinja::Value::from_serialize(Wire::new(event, link));
        env.get_template("body")
            .and_then(|t| t.render(ctx))
            .map_err(|e| Error::config(format!("webhook body template failed: {e}"), "fix the template; the event fields are service, kind, at, version, detail, and title and url when the app set them"))
    }
}

/// Parse every `[[notify.webhook]]` out of the loaded file table.
pub fn webhooks_from_table(
    table: &toml::Table,
    env: &BTreeMap<String, String>,
) -> Result<Vec<Webhook>, Error> {
    let Some(notify) = table.get("notify") else {
        return Ok(Vec::new());
    };
    let Some(list) = notify.get("webhook") else {
        return Ok(Vec::new());
    };
    let specs: Vec<WebhookSpec> = list.clone().try_into().map_err(|e| {
        Error::config(
            format!("[[notify.webhook]] does not parse: {e}"),
            "each entry needs events = [..] and url = \"http://...\"; method, headers, body and fallback are optional",
        )
    })?;
    specs
        .iter()
        .enumerate()
        .map(|(i, s)| s.resolve(env, i))
        .collect()
}

#[cfg(test)]
mod tests;
