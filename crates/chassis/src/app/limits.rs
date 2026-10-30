//! The numbers the guards and stores run with, parsed from the knobs.

use std::path::PathBuf;
use std::time::Duration;

use super::{AppSpec, Limits, NotifyKnobs, UpdateKnobs};
use crate::core::error::Error;
use crate::shell::config_load::Loaded;
use crate::shell::guards::parse_trusted_proxies;

/// `true`/`false` (also `1`/`0`, `yes`/`no`); anything else is a config
/// error naming the knob, so `--check` catches a typo.
pub(super) fn parse_bool(loaded: &Loaded, key: &str) -> Result<bool, Error> {
    match loaded
        .get(key)
        .unwrap_or("false")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "true" | "1" | "yes" | "on" => Ok(true),
        "false" | "0" | "no" | "off" | "" => Ok(false),
        other => Err(Error::config(
            format!("{key} must be true or false, not `{other}`"),
            "set it to true or false",
        )),
    }
}

pub(super) fn parse_u64(loaded: &Loaded, key: &str, min: u64) -> Result<u64, Error> {
    let raw = loaded.get(key).unwrap_or("");
    let v: u64 = raw.trim().parse().map_err(|_| {
        Error::config(
            format!("knob `{key}` = `{raw}` is not a whole number"),
            format!("set {key} to an integer of at least {min}"),
        )
    })?;
    if v < min {
        return Err(Error::config(
            format!("knob `{key}` = {v} is below the minimum {min}"),
            format!("set {key} to at least {min}"),
        ));
    }
    Ok(v)
}

impl Limits {
    /// The cross-checks that need more than one knob, run at parse time so
    /// `--check` refuses a bad list or a half-configured self-update.
    pub(super) fn validate(
        &self,
        #[cfg_attr(not(feature = "self-update"), allow(unused_variables))] spec: &AppSpec,
        #[cfg_attr(not(feature = "dashboard"), allow(unused_variables))] loaded: &Loaded,
    ) -> Result<(), Error> {
        // trusted-sources: validated at parse time so --check refuses a bad list.
        #[cfg(feature = "dashboard")]
        crate::shell::trusted::parse_trusted_admins(
            loaded.get("trusted_admins").unwrap_or(""),
            &self.trusted_proxies,
        )?;
        #[cfg(feature = "self-update")]
        self.validate_update(spec)?;
        Ok(())
    }

    /// Every number the guards and stores run with, parsed once from the
    /// resolved knobs. A bad value is a config error naming the knob, so
    /// `--check` catches it.
    pub(super) fn parse(loaded: &Loaded) -> Result<Limits, Error> {
        Ok(Limits {
            max_body_bytes: parse_u64(loaded, "max_body_bytes", 1)? as usize,
            max_in_flight: parse_u64(loaded, "max_in_flight", 1)? as usize,
            retry_after: Duration::from_secs(parse_u64(loaded, "retry_after_secs", 1)?),
            request_timeout: Duration::from_secs(parse_u64(loaded, "request_timeout_secs", 1)?),
            login_per_min: parse_u64(loaded, "rate_limit_login_per_min", 1)? as u32,
            login_burst: parse_u64(loaded, "rate_limit_login_burst", 1)? as u32,
            token_per_sec: parse_u64(loaded, "rate_limit_token_per_sec", 1)? as u32,
            token_burst: parse_u64(loaded, "rate_limit_token_burst", 1)? as u32,
            subsystem_check_timeout: Duration::from_millis(parse_u64(
                loaded,
                "subsystem_check_timeout_ms",
                1,
            )?),
            healthcheck_timeout: Duration::from_secs(parse_u64(
                loaded,
                "healthcheck_timeout_secs",
                1,
            )?),
            trusted_proxies: parse_trusted_proxies(loaded.get("trusted_proxies").unwrap_or(""))?,
            session_ttl_secs: parse_u64(loaded, "session_ttl_secs", 60)?,
            remember_me_secs: parse_u64(loaded, "remember_me_days", 1)? * 86_400,
            capture_keep: parse_u64(loaded, "capture_keep", 1)? as usize,
            capture_body_bytes: parse_u64(loaded, "capture_body_bytes", 1)? as usize,
            capture_ttl: Duration::from_secs(parse_u64(loaded, "capture_ttl_secs", 1)?),
            capture_redact: loaded
                .get("capture_redact")
                .unwrap_or("")
                .split(',')
                .map(|s| s.trim().to_ascii_lowercase())
                .filter(|s| !s.is_empty())
                .collect(),
            clients_persist: Duration::from_secs(parse_u64(loaded, "clients_persist_secs", 1)?),
            public_url: loaded.get("public_url").map(|s| s.to_string()),
            passkey_ceremony_cap: parse_u64(loaded, "passkey_ceremony_cap", 1)? as usize,
            passkey_ceremony_ttl: Duration::from_secs(parse_u64(
                loaded,
                "passkey_ceremony_ttl_secs",
                1,
            )?),
            passkey_ceremonies_per_ip: parse_u64(loaded, "passkey_ceremonies_per_ip", 1)? as usize,
            update: UpdateKnobs::parse(loaded)?,
            notify: NotifyKnobs::parse(loaded)?,
        })
    }

    /// Only for the control-command paths that never use them.
    pub(super) fn placeholder() -> Self {
        Limits {
            max_body_bytes: 1,
            max_in_flight: 1,
            retry_after: Duration::from_secs(1),
            request_timeout: Duration::from_secs(1),
            login_per_min: 1,
            login_burst: 1,
            token_per_sec: 1,
            token_burst: 1,
            subsystem_check_timeout: Duration::from_secs(1),
            healthcheck_timeout: Duration::from_secs(1),
            trusted_proxies: Vec::new(),
            session_ttl_secs: 60,
            remember_me_secs: 60,
            capture_keep: 1,
            capture_body_bytes: 1,
            capture_ttl: Duration::from_secs(1),
            capture_redact: Vec::new(),
            clients_persist: Duration::from_secs(1),
            public_url: None,
            passkey_ceremony_cap: 64,
            passkey_ceremony_ttl: Duration::from_secs(300),
            passkey_ceremonies_per_ip: 8,
            update: UpdateKnobs {
                mode: "off".into(),
                url: None,
                asset: None,
                pubkey: None,
                allow_insecure: false,
                max_download_bytes: 268_435_456,
                notify_after_failures: 3,
                interval: Duration::from_secs(60),
                startup_delay: Duration::from_secs(0),
                healthy_after: Duration::from_secs(1),
                max_start_attempts: 2,
                hold: String::new(),
                drill: String::new(),
                keep_copies: 1,
                probe_timeout: Duration::from_secs(1),
                download_timeout: Duration::from_secs(1),
                copies_dir: None,
            },
            notify: NotifyKnobs {
                timeout: Duration::from_secs(1),
                retries: 0,
                backoff_base: Duration::from_millis(1),
                backoff_cap: Duration::from_millis(1),
                queue_size: 1,
                health_sample: Duration::from_secs(1),
            },
        }
    }
}

impl UpdateKnobs {
    /// The self-update knobs as parsed (AR3).
    fn parse(loaded: &Loaded) -> Result<Self, Error> {
        Ok(UpdateKnobs {
            mode: loaded.get("update_mode").unwrap_or("off").to_string(),
            url: loaded.get("update_url").map(|s| s.to_string()),
            asset: loaded.get("update_asset").map(|s| s.to_string()),
            interval: Duration::from_secs(parse_u64(loaded, "update_interval_secs", 60)?),
            startup_delay: Duration::from_secs(parse_u64(loaded, "update_startup_delay_secs", 0)?),
            healthy_after: Duration::from_secs(parse_u64(loaded, "update_healthy_after_secs", 1)?),
            max_start_attempts: parse_u64(loaded, "update_max_start_attempts", 1)? as u32,
            hold: loaded.get("update_hold").unwrap_or("").to_string(),
            drill: loaded.get("update_drill").unwrap_or("").to_string(),
            keep_copies: parse_u64(loaded, "update_keep_copies", 1)? as usize,
            probe_timeout: Duration::from_secs(parse_u64(loaded, "update_probe_timeout_secs", 1)?),
            download_timeout: Duration::from_secs(parse_u64(
                loaded,
                "update_download_timeout_secs",
                1,
            )?),
            copies_dir: loaded.get("update_copies_dir").map(PathBuf::from),
            pubkey: loaded
                .get("update_pubkey")
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
            allow_insecure: parse_bool(loaded, "update_allow_insecure")?,
            max_download_bytes: parse_u64(loaded, "update_max_download_bytes", 1)?,
            notify_after_failures: parse_u64(loaded, "update_notify_after_failures", 1)? as u32,
        })
    }
}

impl NotifyKnobs {
    /// The notifier knobs as parsed (AR3).
    fn parse(loaded: &Loaded) -> Result<Self, Error> {
        Ok(NotifyKnobs {
            timeout: Duration::from_secs(parse_u64(loaded, "notify_timeout_secs", 1)?),
            retries: parse_u64(loaded, "notify_retries", 0)? as u32,
            backoff_base: Duration::from_millis(parse_u64(loaded, "notify_backoff_base_ms", 1)?),
            backoff_cap: Duration::from_millis(parse_u64(loaded, "notify_backoff_cap_ms", 1)?),
            queue_size: parse_u64(loaded, "notify_queue_size", 1)? as usize,
            health_sample: Duration::from_secs(parse_u64(loaded, "health_sample_secs", 1)?),
        })
    }
}
