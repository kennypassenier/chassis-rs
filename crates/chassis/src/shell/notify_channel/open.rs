//! Opening a [`Channel`]: which configuration layer fixes each address, the
//! URL checks, and the precedence resolution. Its own module because it is
//! the start-up half of the channel.

use std::sync::{Arc, Mutex};

use tokio::sync::Notify;

use super::{Channel, ChannelConfig, CodeTargets, Credential, Inner, Which};
use crate::core::config::Source;
use crate::core::error::Error;
use crate::core::notify_target::{self as target, Fixed, Inputs, Target, check_url};
use crate::core::notify_token::NotifyToken;
use crate::shell::config_load::Loaded;
use crate::storage::Db;
use crate::storage::notify_meta::NotifyMeta;
use crate::storage::outbox::Outbox;

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
        let fixed = fixed_targets(loaded, prefix)?;
        let code = [code.primary, code.fallback];
        check_code_targets(&code)?;
        let auth = credential(loaded, prefix)?;
        let channel = Channel {
            inner: Arc::new(Inner {
                auth,
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
    pub(super) fn reload(&self) -> Result<(), Error> {
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
}

/// The bearer token for the primary target, from `<P>_NOTIFY_TOKEN`. A token
/// that is not usable stops the start; the message names the variable and
/// the rule, never the value.
fn credential(loaded: &Loaded, prefix: &str) -> Result<Credential, Error> {
    let env_name = format!("{prefix}_NOTIFY_TOKEN");
    let token = NotifyToken::parse(loaded.get("notify_token").unwrap_or(""), &env_name)?;
    Ok(Credential { token, env_name })
}

/// The addresses the configuration fixes, one per target; a fixed address
/// that is not usable stops the start naming the key that holds it.
fn fixed_targets(loaded: &Loaded, prefix: &str) -> Result<[Option<Fixed>; 2], Error> {
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
    Ok(fixed)
}

/// The addresses `App::notify_targets` gave; one that is not usable stops
/// the start.
fn check_code_targets(code: &[Option<String>; 2]) -> Result<(), Error> {
    for (which, value) in Which::BOTH.iter().zip(code) {
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
    Ok(())
}
