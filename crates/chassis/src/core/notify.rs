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
        match &self.body {
            None => Ok(serde_json::to_string(event).expect("event serialises")),
            Some(tpl) => {
                let mut env = minijinja::Environment::new();
                env.add_template("body", tpl).map_err(|e| {
                    Error::config(
                        format!("webhook body template does not parse: {e}"),
                        "fix the template in the config file",
                    )
                })?;
                env.get_template("body")
                    .and_then(|t| t.render(minijinja::Value::from_serialize(event)))
                    .map_err(|e| Error::config(format!("webhook body template failed: {e}"), "fix the template; the event fields are service, kind, at, version, detail"))
            }
        }
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
mod tests {
    use super::*;

    fn env() -> BTreeMap<String, String> {
        BTreeMap::from([("TOK".to_string(), "s3cret".to_string())])
    }

    fn event(kind: &str) -> Event {
        Event {
            service: "inbox".into(),
            kind: kind.into(),
            at: "2026-09-05T07:00:00Z".into(),
            version: "1.1.0".into(),
            detail: "1.0.0 → 1.1.0".into(),
        }
    }

    #[test]
    fn parses_resolves_and_matches() {
        let t: toml::Table = r#"
[[notify.webhook]]
events = ["update.*", "health.degraded"]
url = "http://10.10.10.9:8080/t/ops.alerts"
headers = { Authorization = "Bearer ${TOK}" }
fallback = "http://ha/api/webhook/x"

[[notify.webhook]]
events = ["service.started"]
url = "http://other/hook"
method = "put"
body = '{"svc":"{{ service }}","what":"{{ kind }}"}'
"#
        .parse()
        .unwrap();
        let hooks = webhooks_from_table(&t, &env()).unwrap();
        assert_eq!(hooks.len(), 2);
        assert_eq!(hooks[0].headers["Authorization"], "Bearer s3cret");
        assert!(hooks[0].wants("update.ok"));
        assert!(hooks[0].wants("health.degraded"));
        assert!(!hooks[0].wants("service.started"));
        assert!(!hooks[0].wants("updates.ok"), "prefix match needs the dot");
        assert_eq!(hooks[1].method, "PUT");
        assert_eq!(
            hooks[1].render_body(&event("service.started")).unwrap(),
            r#"{"svc":"inbox","what":"service.started"}"#
        );
        let default_body = hooks[0].render_body(&event("update.ok")).unwrap();
        assert!(default_body.contains("\"kind\":\"update.ok\""));
    }

    #[test]
    fn missing_var_bad_method_and_no_events_are_refused_with_remedies() {
        let t: toml::Table = "[[notify.webhook]]\nevents=[\"a\"]\nurl=\"http://h/${NOPE}\"\n"
            .parse()
            .unwrap();
        let err = webhooks_from_table(&t, &env()).unwrap_err();
        assert!(err.remedy.contains("export NOPE="));
        let t: toml::Table =
            "[[notify.webhook]]\nevents=[\"a\"]\nurl=\"http://h\"\nmethod=\"GET\"\n"
                .parse()
                .unwrap();
        assert!(
            webhooks_from_table(&t, &env())
                .unwrap_err()
                .message
                .contains("GET")
        );
        let t: toml::Table = "[[notify.webhook]]\nevents=[]\nurl=\"http://h\"\n"
            .parse()
            .unwrap();
        assert!(
            webhooks_from_table(&t, &env())
                .unwrap_err()
                .message
                .contains("no events")
        );
        let t: toml::Table = "[other]\nx=1\n".parse().unwrap();
        assert!(webhooks_from_table(&t, &env()).unwrap().is_empty());
    }
}
