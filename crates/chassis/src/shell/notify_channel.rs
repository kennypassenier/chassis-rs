//! The notification channel's state (3.15.0, `docs/NOTIFY_DESIGN.md`): the
//! two targets with their precedence, the outbox and the records beside it.
//!
//! This is the one object the pieces share: the intake task writes to it,
//! the delivery loop reads the targets from it, and the Status card's API
//! shows and changes it. It sends nothing itself (`notify_delivery`) and
//! speaks no HTTP (`notify_api`).

mod edit;
mod open;
mod status;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::Notify;

use crate::core::notify_target::{Fixed, KEY_FALLBACK, KEY_PRIMARY, Target};
use crate::core::notify_token::NotifyToken;
use crate::shell::notify::NotifyConfig;
use crate::storage::notify_meta::{LastDelivery, LastError, NotifyMeta};
use crate::storage::outbox::{Counts, Outbox};

/// Which of the two targets.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Which {
    Primary,
    Fallback,
}

impl Which {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Which::Primary => "primary",
            Which::Fallback => "fallback",
        }
    }

    fn index(self) -> usize {
        self as usize
    }

    pub(crate) fn key(self) -> &'static str {
        match self {
            Which::Primary => KEY_PRIMARY,
            Which::Fallback => KEY_FALLBACK,
        }
    }

    pub(crate) const BOTH: [Which; 2] = [Which::Primary, Which::Fallback];
}

/// The app's own defaults (`App::notify_targets`).
#[derive(Debug, Clone, Default)]
pub(crate) struct CodeTargets {
    pub primary: Option<String>,
    pub fallback: Option<String>,
}

/// The knobs of the channel.
#[derive(Debug, Clone)]
pub(crate) struct ChannelConfig {
    /// Timeout, retries and backoff of one send (the existing notify knobs).
    pub send: NotifyConfig,
    /// The outbox cap, in messages.
    pub outbox_cap: usize,
    /// The wait after a failed message grows from `round_base`, doubling,
    /// to `round_cap`.
    pub round_base: Duration,
    pub round_cap: Duration,
}

impl ChannelConfig {
    pub(crate) const ROUND_BASE: Duration = Duration::from_secs(30);
    pub(crate) const ROUND_CAP: Duration = Duration::from_secs(15 * 60);
}

/// What the sender shows the PRIMARY target: the bearer token (when one is
/// set) and the variable it comes from, for the sentences that name it. The
/// fallback is a webhook with its own secret address and gets nothing.
#[derive(Debug, Clone)]
pub(crate) struct Credential {
    pub token: Option<NotifyToken>,
    pub env_name: String,
}

struct Inner {
    auth: Credential,
    cfg: ChannelConfig,
    outbox: Outbox,
    meta: NotifyMeta,
    fixed: [Option<Fixed>; 2],
    code: [Option<String>; 2],
    resolved: Mutex<[Target; 2]>,
    wake: Notify,
}

#[derive(Clone)]
pub(crate) struct Channel {
    inner: Arc<Inner>,
}

/// What the card shows, before it is turned into JSON.
pub(crate) struct View {
    pub primary: Target,
    pub fallback: Target,
    pub saved: [bool; 2],
    pub code: [Option<String>; 2],
    pub counts: Counts,
    pub cap: usize,
    pub dropped_total: u64,
    pub last_error: Option<LastError>,
    pub last_delivery: Option<LastDelivery>,
    /// Whether a primary token is set, and the variable it comes from.
    pub token_set: bool,
    pub token_env: String,
}

impl Channel {
    pub(crate) fn config(&self) -> &ChannelConfig {
        &self.inner.cfg
    }

    /// The primary target's credential (see [`Credential`]).
    pub(crate) fn primary_credential(&self) -> &Credential {
        &self.inner.auth
    }

    pub(crate) fn outbox(&self) -> &Outbox {
        &self.inner.outbox
    }

    pub(crate) fn wake(&self) {
        self.inner.wake.notify_one();
    }

    pub(crate) fn woken(&self) -> tokio::sync::futures::Notified<'_> {
        self.inner.wake.notified()
    }

    pub(crate) fn target(&self, which: Which) -> Target {
        self.inner.resolved.lock().expect("targets lock")[which.index()].clone()
    }

    /// The addresses in force, primary first. Empty = nothing to send to.
    pub(crate) fn targets(&self) -> Vec<(Which, String)> {
        Which::BOTH
            .into_iter()
            .filter_map(|w| self.target(w).value.map(|v| (w, v)))
            .collect()
    }

    pub(crate) fn active(&self) -> bool {
        !self.targets().is_empty()
    }
}
