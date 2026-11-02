//! The emitting half of [`Notifier`]: `emit` and its variants. All of them
//! end in one private function, so a variant is only a different set of
//! optional extras (a damping key, a title and link).

use super::{Dispatch, Notifier};
use crate::core::notify::Event;
use crate::core::notify_link::Link;
use crate::core::notify_target::Dedup;
use crate::shell::notify_intake::Queued;
use crate::shell::time::now_rfc3339;

impl Notifier {
    /// Fire and forget. A full queue drops the event with one warning:
    /// blocking a request handler on a webhook would be the wrong trade.
    pub fn emit(&self, kind: &str, version: &str, detail: impl Into<String>) {
        self.emit_inner(kind, version, detail.into(), None, None);
    }

    /// [`Notifier::emit`] with kyu's damping: a repeat of `dedup` inside its
    /// window is not stored again by the hub and counts as delivered. Use it
    /// for failures that repeat (a backup that fails every night); a success
    /// message sends no key. Only the shared sender (primary and fallback
    /// targets) carries it; a `[[notify.webhook]]` entry sends as before.
    pub fn emit_keyed(
        &self,
        kind: &str,
        version: &str,
        detail: impl Into<String>,
        dedup: crate::core::notify_target::Dedup,
    ) {
        self.emit_inner(kind, version, detail.into(), Some(dedup), None);
    }

    /// [`Notifier::emit`] with a title and a link (`[notify-link-1]`): the
    /// JSON body gains `"title"` and `"url"` for whichever the [`Link`] sets,
    /// in the shared sender, its outbox and the default body of a
    /// `[[notify.webhook]]` entry (a custom template sees `title` and `url`
    /// as variables). Build the link with [`Link::new`]; it refuses a url
    /// that is neither a path of the app nor an http(s) address.
    pub fn emit_linked(&self, kind: &str, version: &str, detail: impl Into<String>, link: Link) {
        self.emit_inner(kind, version, detail.into(), None, Some(link));
    }

    /// [`Notifier::emit_linked`] with kyu's damping, as [`Notifier::emit_keyed`].
    pub fn emit_linked_keyed(
        &self,
        kind: &str,
        version: &str,
        detail: impl Into<String>,
        link: Link,
        dedup: Dedup,
    ) {
        self.emit_inner(kind, version, detail.into(), Some(dedup), Some(link));
    }

    fn emit_inner(
        &self,
        kind: &str,
        version: &str,
        detail: String,
        dedup: Option<Dedup>,
        link: Option<Link>,
    ) {
        // Never the detail text: apps put health data in it ([fix-notify-log-1]).
        tracing::info!(event = kind, version, detail_len = detail.len(), "event");
        let event = Event {
            service: self.service.clone(),
            kind: kind.to_string(),
            at: now_rfc3339(),
            version: version.to_string(),
            detail,
        };
        if !self.routes.iter().any(|h| h.wants(kind)) {
            self.intake.offer(Queued {
                event: event.clone(),
                dedup,
                link: link.clone(),
            });
        }
        let Some(tx) = &self.tx else { return };
        if let Err(e) = tx.try_send(Dispatch { event, link }) {
            tracing::warn!(error = %e, "notification queue full; event dropped (it is in the log above)");
        }
    }
}
