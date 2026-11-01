//! The Web Push knobs (habits-push-1, `docs/PUSH_DESIGN.md`).

use super::{PUSH, k};
use crate::core::config::Knob;

pub(super) fn rows() -> Vec<Knob> {
    vec![
        k(
            "push_subject",
            None,
            PUSH,
            "Who sends: a `mailto:` address or an `https:` URL, put in every signed push message (VAPID `sub`). Required before the first message goes out; push services use it to contact the operator.",
        ),
        k(
            "push_ttl_secs",
            Some("86400"),
            PUSH,
            "Seconds a push service keeps a message for a device that is off; 0 drops it when the device is not reachable at once. A single message may override it.",
        ),
        k(
            "push_timeout_secs",
            Some("10"),
            PUSH,
            "Seconds allowed per request to a push service.",
        ),
        k(
            "push_max_subscriptions",
            Some("50"),
            PUSH,
            "Most browsers that may be subscribed at once; a new subscription past it is refused (an existing one can still renew).",
        ),
        k(
            "push_concurrency",
            Some("8"),
            PUSH,
            "Most requests to push services in flight at the same time while one message goes to every subscription.",
        ),
    ]
}
