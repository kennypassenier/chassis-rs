//! The notification channel's state (3.15.0, `docs/NOTIFY_DESIGN.md`): the
//! two targets with their precedence, the outbox and the records beside it.
//!
//! This is the one object the pieces share: the intake task writes to it,
//! the delivery loop reads the targets from it, and the Status card's API
//! shows and changes it. It sends nothing itself (`notify_delivery`) and
//! speaks no HTTP (`notify_api`).

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::Notify;

use crate::core::config::Source;
use crate::core::error::Error;
use crate::core::notify_target::{
    self as target, Dedup, Fixed, Inputs, KEY_FALLBACK, KEY_PRIMARY, Target, check_url,
};
use crate::shell::config_load::Loaded;
use crate::shell::notify::NotifyConfig;
use crate::shell::time::{now_epoch, now_rfc3339};
use crate::storage::Db;
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

struct Inner {
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
}

/// A flag, an environment variable or a file key that fixes `key`.
fn fixed_from(loaded: &Loaded, prefix: &str, key: &str) -> Option<Fixed> {
    let (by, name) = match loaded.source(key)? {
        Source::Flag => ("flag", format!("--{}", key.replace('_', "-"))),
        Source::Env => ("env", format!("{prefix}_{}", key.to_ascii_uppercase())),
        Source::File => ("file", key.to_string()),
        Source::Default => return None,
    };
    let expanded = loaded
        .resolved
        .iter()
        .find(|r| r.key == key)
        .is_some_and(|r| r.expanded);
    Some(Fixed {
        value: loaded.get(key).unwrap_or("").to_string(),
        by,
        name,
        // The environment and a flag are where a webhook id is kept; a file
        // value is public unless it pulled the id in through ${VAR}.
        secret: by != "file" || expanded,
    })
}

impl Channel {
    /// Open the channel on the kit file. A bad configured or coded address
    /// stops the start with the key that holds it; a bad SAVED address is
    /// ignored with a log line (it can only have come from an older build).
    pub(crate) fn open(
        loaded: &Loaded,
        prefix: &str,
        kit_db: Db,
        code: CodeTargets,
        cfg: ChannelConfig,
    ) -> Result<Channel, Error> {
        let mut fixed = [None, None];
        for which in Which::BOTH {
            let f = fixed_from(loaded, prefix, which.key());
            if let Some(f) = &f
                && !f.value.trim().is_empty()
            {
                check_url(&f.value).map_err(|e| {
                    Error::config(
                        format!("{} ({}) is not usable: {}", f.name, f.by, e.message),
                        e.remedy,
                    )
                })?;
            }
            fixed[which.index()] = f;
        }
        let code = [code.primary, code.fallback];
        for (which, value) in Which::BOTH.iter().zip(&code) {
            if let Some(v) = value.as_deref().filter(|v| !v.trim().is_empty()) {
                check_url(v).map_err(|e| {
                    Error::config(
                        format!(
                            "App::notify_targets gave a {} address that is not usable: {}",
                            which.as_str(),
                            e.message
                        ),
                        e.remedy,
                    )
                })?;
            }
        }
        let channel = Channel {
            inner: Arc::new(Inner {
                outbox: Outbox::new(kit_db.clone(), cfg.outbox_cap),
                meta: NotifyMeta::new(kit_db),
                cfg,
                fixed,
                code,
                resolved: Mutex::new([
                    Target {
                        value: None,
                        layer: target::Layer::Default,
                        fixed: None,
                    },
                    Target {
                        value: None,
                        layer: target::Layer::Default,
                        fixed: None,
                    },
                ]),
                wake: Notify::new(),
            }),
        };
        channel.reload()?;
        Ok(channel)
    }

    /// Read the saved values again and apply the precedence.
    fn reload(&self) -> Result<(), Error> {
        let mut next = Vec::with_capacity(2);
        for which in Which::BOTH {
            let stored = self
                .inner
                .meta
                .stored(which.key())?
                .filter(|v| v.trim().is_empty() || check_url(v).is_ok());
            next.push(target::resolve(&Inputs {
                fixed: self.inner.fixed[which.index()].clone(),
                stored,
                code: self.inner.code[which.index()].clone(),
            }));
        }
        let mut guard = self.inner.resolved.lock().expect("targets lock");
        let fallback = next.pop().expect("two targets");
        let primary = next.pop().expect("two targets");
        *guard = [primary, fallback];
        Ok(())
    }

    pub(crate) fn config(&self) -> &ChannelConfig {
        &self.inner.cfg
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

    fn refuse_locked(which: Which, f: &Fixed) -> Error {
        Error::invalid(
            format!("the {} address is fixed: {}", which.as_str(), f.reason()),
            "change it where it is set and restart the service; this page cannot override it",
        )
    }

    /// Save addresses from the page. `None` leaves a target as it is; an
    /// empty string saves "no target". An address the configuration fixes is
    /// refused unless it is exactly the fixed one.
    pub(crate) fn save(&self, primary: Option<&str>, fallback: Option<&str>) -> Result<(), Error> {
        if primary.is_none() && fallback.is_none() {
            return Err(Error::invalid(
                "nothing to change: give a primary address, a fallback address or reset",
                "send primary and/or fallback as text, or {\"reset\": true}",
            ));
        }
        let mut clean: [Option<String>; 2] = [None, None];
        for (which, given) in [(Which::Primary, primary), (Which::Fallback, fallback)] {
            let Some(text) = given else { continue };
            let text = text.trim();
            if let Some(f) = &self.inner.fixed[which.index()] {
                if f.value.trim() != text {
                    return Err(Self::refuse_locked(which, f));
                }
                continue;
            }
            clean[which.index()] = Some(if text.is_empty() {
                String::new()
            } else {
                check_url(text).map_err(|e| {
                    Error::invalid(
                        format!("the {} address: {}", which.as_str(), e.message),
                        e.remedy,
                    )
                })?
            });
        }
        let entries: Vec<(&str, &str)> = Which::BOTH
            .into_iter()
            .filter_map(|w| clean[w.index()].as_deref().map(|v| (w.key(), v)))
            .collect();
        self.inner.meta.store(&entries)?;
        self.after_change()
    }

    /// Delete the saved addresses: back to the code default, or none.
    pub(crate) fn reset(&self) -> Result<(), Error> {
        let keys: Vec<&str> = Which::BOTH
            .into_iter()
            .filter(|w| self.inner.fixed[w.index()].is_none())
            .map(Which::key)
            .collect();
        if keys.is_empty() {
            return Err(Error::invalid(
                "both addresses are fixed by configuration, so there is nothing saved to reset",
                "change them where they are set and restart the service",
            ));
        }
        self.inner.meta.forget(&keys)?;
        self.after_change()
    }

    /// A target changed: waiting messages need not wait out an old backoff.
    fn after_change(&self) -> Result<(), Error> {
        self.reload()?;
        self.inner.outbox.due_now()?;
        self.wake();
        Ok(())
    }
}
