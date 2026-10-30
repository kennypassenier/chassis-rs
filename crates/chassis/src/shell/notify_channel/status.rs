//! What flows through a [`Channel`] and what it remembers: enqueueing an
//! event, recording the last error and delivery, and the card's view.

use super::{Channel, View, Which};
use crate::core::error::Error;
use crate::core::notify_target::{Dedup, KEY_FALLBACK, KEY_PRIMARY};
use crate::shell::time::{now_epoch, now_rfc3339};
use crate::storage::notify_meta::{LastDelivery, LastError};

impl Channel {
    /// Write one event to the outbox (blocking; call from a blocking task).
    /// Nothing is written while no target is set: the event is in the log,
    /// and a message nobody could ever have received is not worth keeping.
    pub(crate) fn enqueue(&self, q: &crate::shell::notify_intake::Queued) -> Result<(), Error> {
        let event = &q.event;
        if !self.active() {
            return Ok(());
        }
        let body = serde_json::to_string(event).expect("event serialises");
        let dropped = self.inner.outbox.enqueue(
            &event.kind,
            &body,
            q.dedup
                .as_ref()
                .map(|d: &Dedup| (d.key.as_str(), d.window.as_deref())),
            now_epoch() as i64,
        )?;
        if dropped > 0 {
            self.inner.meta.add_dropped(dropped)?;
            self.record_error(
                "outbox",
                &format!(
                    "The outbox is full ({} messages), so the {} oldest waiting {} dropped to make room.",
                    self.inner.cfg.outbox_cap,
                    dropped,
                    if dropped == 1 { "message was" } else { "messages were" }
                ),
            );
        }
        self.wake();
        Ok(())
    }

    /// Remember an error and when it happened. A failing disk must not stop
    /// the sender, so a failed write is only logged.
    pub(crate) fn record_error(&self, target: &str, message: &str) {
        let e = LastError {
            at: now_rfc3339(),
            target: target.to_string(),
            message: message.to_string(),
        };
        if let Err(err) = self.inner.meta.set_last_error(&e) {
            tracing::warn!(error = %err, "notify: the last error could not be saved");
        }
    }

    pub(crate) fn record_delivery(&self, via: Which) {
        let d = LastDelivery {
            at: now_rfc3339(),
            via: via.as_str().to_string(),
        };
        if let Err(err) = self.inner.meta.set_last_delivery(&d) {
            tracing::warn!(error = %err, "notify: the last delivery could not be saved");
        }
    }

    /// Everything the card shows. Blocking (reads the kit file).
    pub(crate) fn view(&self) -> Result<View, Error> {
        let meta = &self.inner.meta;
        Ok(View {
            primary: self.target(Which::Primary),
            fallback: self.target(Which::Fallback),
            saved: [
                meta.stored(KEY_PRIMARY)?.is_some(),
                meta.stored(KEY_FALLBACK)?.is_some(),
            ],
            code: self.inner.code.clone(),
            counts: self.inner.outbox.counts()?,
            cap: self.inner.cfg.outbox_cap,
            dropped_total: meta.dropped_total()?,
            last_error: meta.last_error()?,
            last_delivery: meta.last_delivery()?,
        })
    }
}
