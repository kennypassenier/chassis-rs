//! Notification wiring on `App`: the project-facing handle and default
//! addresses, and the channel started with the app.

#[cfg(feature = "dashboard")]
use super::limits::parse_u64;
use super::{App, AppSpec, Limits, NotifyKnobs};
use crate::core::error::Error;
use crate::shell::config_load::Loaded;
use std::collections::BTreeMap;

impl App {
    /// 3.15.0: open the channel on the kit file, connect the notifier's door
    /// and start the writer and delivery tasks.
    #[cfg(all(feature = "notify", feature = "dashboard"))]
    pub(super) fn start_notify_channel(
        &self,
        loaded: &Loaded,
        kit: crate::storage::Db,
        code: Option<(String, Option<String>)>,
    ) -> Result<crate::shell::notify_api::NotifyState, Error> {
        use crate::shell::{notify_channel as nc, notify_delivery, notify_intake};
        let (primary, fallback) = code.unzip();
        let cfg = nc::ChannelConfig {
            send: self.limits.notify.config(),
            outbox_cap: parse_u64(loaded, "notify_outbox_max", 1)? as usize,
            round_base: nc::ChannelConfig::ROUND_BASE,
            round_cap: nc::ChannelConfig::ROUND_CAP,
        };
        let channel = nc::Channel::open(
            loaded,
            &self.spec.prefix(),
            kit,
            nc::CodeTargets {
                primary,
                fallback: fallback.flatten(),
            },
            cfg,
        )?;
        let (tx, mut rx) =
            tokio::sync::mpsc::channel::<notify_intake::Queued>(notify_intake::HAND_OFF);
        self.notifier.intake().connect(tx);
        let writer = channel.clone();
        tokio::spawn(async move {
            while let Some(q) = rx.recv().await {
                let ch = writer.clone();
                let res = tokio::task::spawn_blocking(move || ch.enqueue(&q)).await;
                if let Ok(Err(e)) | Err(e) = res.map_err(|e| {
                    Error::internal(format!("a notification task failed: {e}"), "report this")
                }) {
                    tracing::warn!(error = %e, "notify: an event could not be written to the outbox");
                    writer.record_error("outbox", "An event could not be written to disk.");
                }
            }
        });
        tokio::spawn(notify_delivery::run(channel.clone()));
        Ok(crate::shell::notify_api::NotifyState {
            channel,
            service: self.spec.name,
            version: self.spec.version,
        })
    }
}

impl NotifyKnobs {
    /// The delivery settings of the webhook sender, from the parsed knobs.
    pub(super) fn config(&self) -> crate::shell::notify::NotifyConfig {
        crate::shell::notify::NotifyConfig {
            timeout: self.timeout,
            retries: self.retries,
            backoff_base: self.backoff_base,
            backoff_cap: self.backoff_cap,
            queue_size: self.queue_size,
        }
    }
}

/// The notifier and its drain task handle, built from the file's webhook
/// tables at parse time so `--check` refuses a bad webhook.
pub(super) fn prepare_notifier(
    spec: &AppSpec,
    loaded: &Loaded,
    env: &BTreeMap<String, String>,
    limits: &Limits,
) -> Result<
    (
        crate::shell::notify::Notifier,
        Option<crate::shell::notify::Drain>,
    ),
    Error,
> {
    let hooks = crate::core::notify::webhooks_from_table(&loaded.file_table, env)?;
    Ok(crate::shell::notify::Notifier::prepare(
        spec.name,
        hooks,
        limits.notify.config(),
    ))
}
