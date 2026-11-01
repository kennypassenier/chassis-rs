//! The handle an app sends with: `app.push().send(Push::new(...))`.
//!
//! It exists from the moment the `App` does, so handlers and background
//! tasks can be given a clone before the service starts; it becomes usable
//! once the dashboard is mounted (the sender needs the kit file and the key
//! that seals the VAPID secret). Same shape as [`crate::shell::notify::Notifier`]:
//! a cheap clone of one shared cell.

use std::sync::{Arc, OnceLock};

use super::message::Push;
use super::sender::{PushReport, Sender};
use crate::core::error::Error;

/// Cheap to clone; every clone sends through the same sender.
#[derive(Clone, Default)]
pub struct PushHandle {
    sender: Arc<OnceLock<Sender>>,
}

impl std::fmt::Debug for PushHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PushHandle")
            .field("ready", &self.is_ready())
            .finish()
    }
}

impl PushHandle {
    /// Called by the dashboard mount, once.
    pub(crate) fn connect(&self, sender: Sender) {
        if self.sender.set(sender).is_err() {
            tracing::warn!("push: the sender was connected twice; the first one stays");
        }
    }

    /// Whether messages can be sent: the service has started with a login.
    pub fn is_ready(&self) -> bool {
        self.sender.get().is_some()
    }

    /// Send `push` to every subscribed browser. The report says how many
    /// push services accepted it, how many subscriptions were removed because
    /// the service said they are gone, and how many failed (with the last
    /// error). An `Err` means nothing was attempted: the service has not
    /// started or runs without a login, `push_subject` is not set, or the
    /// notification itself is invalid.
    pub async fn send(&self, push: Push) -> Result<PushReport, Error> {
        match self.sender.get() {
            Some(sender) => sender.send(&push).await,
            None => Err(Error::dependency(
                "push is not available: the service has not started its dashboard, or it runs open without a login",
                "send after App::start, and give the service a login (<PREFIX>_TOKEN and <PREFIX>_SECRET_KEY); push needs the key that seals its VAPID secret",
            )),
        }
    }
}
