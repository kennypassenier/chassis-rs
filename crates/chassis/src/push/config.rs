//! The Web Push knobs, parsed once from the resolved configuration. Parsed
//! at start-up of the app (`--check` refuses a bad value) and again when the
//! push service is mounted.

use std::time::Duration;

use super::vapid::check_subject;
use crate::app::parse_u64;
use crate::core::error::Error;
use crate::shell::config_load::Loaded;

/// What the sender runs with.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PushKnobs {
    /// The VAPID `sub` claim; `None` until the owner sets `push_subject`.
    pub subject: Option<String>,
    /// How long a push service keeps a message for an offline device.
    pub ttl: Duration,
    /// Seconds allowed per request to a push service.
    pub timeout: Duration,
    /// Most subscriptions kept; a new one past it is refused.
    pub max_subscriptions: usize,
    /// Most requests to push services in flight at once.
    pub concurrency: usize,
}

impl PushKnobs {
    /// Read the `push_*` knobs. A subject that is neither `mailto:` nor
    /// `https:` is refused here, not when the first message goes out.
    pub fn parse(loaded: &Loaded) -> Result<Self, Error> {
        let subject = loaded
            .get("push_subject")
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        if let Some(s) = &subject {
            check_subject(s)?;
        }
        Ok(PushKnobs {
            subject,
            ttl: Duration::from_secs(parse_u64(loaded, "push_ttl_secs", 0)?),
            timeout: Duration::from_secs(parse_u64(loaded, "push_timeout_secs", 1)?),
            max_subscriptions: parse_u64(loaded, "push_max_subscriptions", 1)? as usize,
            concurrency: parse_u64(loaded, "push_concurrency", 1)? as usize,
        })
    }

    /// The subject to sign with, or the sentence that says how to set one.
    pub fn require_subject(&self) -> Result<&str, Error> {
        self.subject.as_deref().ok_or_else(|| {
            Error::config(
                "push_subject is not set, so push messages cannot be signed",
                "set push_subject (or <PREFIX>_PUSH_SUBJECT) to a mailto: address or an https: URL that identifies this service",
            )
        })
    }
}
