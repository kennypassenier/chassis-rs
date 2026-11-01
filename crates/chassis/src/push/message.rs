//! What an app sends: [`Push`] is a notification as the service worker will
//! show it. Pure: building it, checking it and turning it into the JSON the
//! worker reads (`sw-push-logic.js` is the other end of that contract).

use std::time::Duration;

use serde_json::{Value, json};

use crate::core::error::Error;

/// Most action buttons one notification may carry. Browsers show fewer
/// (`Notification.maxActions`, usually two); the worker cuts the list there.
pub const MAX_ACTIONS: usize = 4;

/// How soon the push service should wake the device (RFC 8030 section 5.3).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[non_exhaustive]
pub enum Urgency {
    VeryLow,
    Low,
    Normal,
    High,
}

impl Urgency {
    /// The `Urgency` header's spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            Urgency::VeryLow => "very-low",
            Urgency::Low => "low",
            Urgency::Normal => "normal",
            Urgency::High => "high",
        }
    }
}

/// One button on the notification. Pressing it makes the worker `POST` to
/// `url` with the login cookie and close the notification.
#[derive(Clone, Debug, PartialEq, Eq)]
struct Action {
    id: String,
    title: String,
    url: String,
}

/// A notification: `Push::new("Water drinken").body("...").url("/habits/water")`.
#[derive(Clone, Debug)]
pub struct Push {
    title: String,
    body: Option<String>,
    url: Option<String>,
    tag: Option<String>,
    actions: Vec<Action>,
    urgency: Option<Urgency>,
    ttl: Option<Duration>,
}

impl Push {
    /// A notification with this title.
    pub fn new(title: &str) -> Self {
        Push {
            title: title.into(),
            body: None,
            url: None,
            tag: None,
            actions: Vec::new(),
            urgency: None,
            ttl: None,
        }
    }

    /// The second line.
    pub fn body(mut self, body: &str) -> Self {
        self.body = Some(body.into());
        self
    }

    /// Where a tap on the notification goes: a path of the app (`/habits/water`).
    pub fn url(mut self, path: &str) -> Self {
        self.url = Some(path.into());
        self
    }

    /// Notifications with the same tag replace each other instead of piling up.
    pub fn tag(mut self, tag: &str) -> Self {
        self.tag = Some(tag.into());
        self
    }

    /// A button. `id` names it, `title` is its label and `path` is the app
    /// route the worker `POST`s to when it is pressed (same origin, behind
    /// the login like any other API route).
    pub fn action(mut self, id: &str, title: &str, path: &str) -> Self {
        self.actions.push(Action {
            id: id.into(),
            title: title.into(),
            url: path.into(),
        });
        self
    }

    /// The `Urgency` header; without it the push service decides.
    pub fn urgency(mut self, urgency: Urgency) -> Self {
        self.urgency = Some(urgency);
        self
    }

    /// How long the push service keeps the message for a device that is off
    /// (default: the `push_ttl_secs` knob).
    pub fn ttl(mut self, ttl: Duration) -> Self {
        self.ttl = Some(ttl);
        self
    }

    pub(crate) fn urgency_value(&self) -> Option<Urgency> {
        self.urgency
    }

    pub(crate) fn ttl_value(&self) -> Option<Duration> {
        self.ttl
    }

    /// The JSON the worker's `push` handler reads, after checking the
    /// notification: a title, same-origin paths, a bounded number of buttons.
    pub(crate) fn payload(&self) -> Result<Vec<u8>, Error> {
        self.validate()?;
        let actions: Vec<Value> = self
            .actions
            .iter()
            .map(|a| json!({ "action": a.id, "title": a.title, "url": a.url }))
            .collect();
        let mut doc = json!({ "title": self.title, "actions": actions });
        for (key, value) in [("body", &self.body), ("url", &self.url), ("tag", &self.tag)] {
            if let Some(v) = value {
                doc[key] = json!(v);
            }
        }
        Ok(doc.to_string().into_bytes())
    }

    fn validate(&self) -> Result<(), Error> {
        if self.title.trim().is_empty() {
            return Err(Error::invalid(
                "a push notification needs a title",
                "give Push::new a non-empty title",
            ));
        }
        if self.actions.len() > MAX_ACTIONS {
            return Err(Error::invalid(
                format!("a push notification carries at most {MAX_ACTIONS} actions"),
                "drop some actions; browsers show two anyway",
            ));
        }
        let paths = self.url.iter().chain(self.actions.iter().map(|a| &a.url));
        for path in paths {
            check_path(path)?;
        }
        if self
            .actions
            .iter()
            .any(|a| a.id.is_empty() || a.title.is_empty())
        {
            return Err(Error::invalid(
                "a push action needs an id and a title",
                "give Push::action a non-empty id and title",
            ));
        }
        Ok(())
    }
}

/// A path of this app: starts with one `/`, so neither another site nor a
/// scheme-relative `//host` can be reached through a notification.
fn check_path(path: &str) -> Result<(), Error> {
    if path.starts_with('/') && !path.starts_with("//") && !path.contains('\\') {
        return Ok(());
    }
    Err(Error::invalid(
        format!("`{path}` is not a path of this app"),
        "use a path that starts with a single `/`, such as /habits/water",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(p: &Push) -> Value {
        serde_json::from_slice(&p.payload().unwrap()).unwrap()
    }

    #[test]
    fn the_payload_carries_exactly_what_was_set() {
        let p = Push::new("Water drinken")
            .body("Het is tijd")
            .url("/habits/water")
            .tag("water")
            .action("done", "Gedaan", "/api/habits/water/done")
            .action("snooze", "Over 1 uur", "/api/habits/water/snooze");
        assert_eq!(
            parsed(&p),
            json!({
                "title": "Water drinken", "body": "Het is tijd", "url": "/habits/water",
                "tag": "water",
                "actions": [
                    {"action": "done", "title": "Gedaan", "url": "/api/habits/water/done"},
                    {"action": "snooze", "title": "Over 1 uur", "url": "/api/habits/water/snooze"},
                ],
            })
        );
        assert_eq!(
            parsed(&Push::new("x")),
            json!({"title": "x", "actions": []})
        );
    }

    #[test]
    fn a_notification_that_could_leave_the_app_or_has_no_title_is_refused() {
        assert!(Push::new("  ").payload().is_err());
        for bad in ["https://evil.example", "//evil.example", "habits", "/a\\b"] {
            assert!(Push::new("x").url(bad).payload().is_err(), "{bad}");
            assert!(
                Push::new("x").action("a", "A", bad).payload().is_err(),
                "{bad}"
            );
        }
        let many =
            (0..=MAX_ACTIONS).fold(Push::new("x"), |p, i| p.action(&format!("a{i}"), "A", "/x"));
        assert!(many.payload().is_err());
        assert!(Push::new("x").action("", "A", "/x").payload().is_err());
    }

    #[test]
    fn urgency_has_the_rfc_8030_spellings() {
        let all = [
            Urgency::VeryLow,
            Urgency::Low,
            Urgency::Normal,
            Urgency::High,
        ];
        let names: Vec<_> = all.iter().map(|u| u.as_str()).collect();
        assert_eq!(names, ["very-low", "low", "normal", "high"]);
    }
}
