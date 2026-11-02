//! Where a notification goes, as a pure decision (3.15.0, `docs/NOTIFY_DESIGN.md`).
//!
//! The kit sends every event to a primary target (a kyu topic) and, when the
//! primary does not take it, to a fallback target (the household Home
//! Assistant webhook). Each target is one setting with the same precedence as
//! the storage budget, strongest first:
//!
//! 1. configuration: a flag, an environment variable or a config file key,
//! 2. the value saved from the Status page,
//! 3. the code default the app gave (`App::notify_targets`),
//! 4. the kit default: no target.
//!
//! This module only calculates. Reading the layers, the database and the
//! network is the shell's job.

use crate::core::error::Error;

/// The knob keys: file key, flag and (upper-cased, prefixed) environment name.
pub const KEY_PRIMARY: &str = "notify_url";
pub const KEY_FALLBACK: &str = "notify_fallback_url";
/// The optional third address: where the kit's own events go (configuration only).
pub const KEY_KIT: &str = "notify_kit_url";

/// The longest address the kit accepts.
pub const MAX_URL_BYTES: usize = 2048;

/// Which layer decided a target's value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
#[non_exhaustive]
pub enum Layer {
    /// A flag, an environment variable or a config file key. Locked.
    Configuration,
    /// Saved from the Status page.
    Page,
    /// The app's own default (`App::notify_targets`).
    Code,
    /// The kit's default: no target.
    Default,
}

/// A value that configuration fixes, and where it came from.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct Fixed {
    /// The resolved text; empty means "configured to have no target".
    pub value: String,
    /// `flag`, `env` or `file`.
    pub by: &'static str,
    /// The flag, variable or file key.
    pub name: String,
    /// The value came from a flag, the environment or a `${VAR}` reference:
    /// it may carry a webhook id, so it is never shown in full.
    pub secret: bool,
}

impl Fixed {
    /// The reason the page gives for the lock.
    pub fn reason(&self) -> String {
        match self.by {
            "flag" => format!(
                "it is set by the flag {} when the service starts",
                self.name
            ),
            "env" => format!(
                "it is set by the environment variable {} when the service starts",
                self.name
            ),
            _ => format!(
                "it is set by the key {} in the config file when the service starts",
                self.name
            ),
        }
    }
}

/// Everything one target's precedence reads.
#[derive(Debug, Clone, Default)]
#[non_exhaustive]
pub struct Inputs {
    pub fixed: Option<Fixed>,
    /// The page's saved value. `Some("")` is a choice: "no target", which
    /// also switches off a code default.
    pub stored: Option<String>,
    pub code: Option<String>,
}

/// A target after the precedence ran.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct Target {
    /// The address in force; `None` is "not set".
    pub value: Option<String>,
    pub layer: Layer,
    pub fixed: Option<Fixed>,
}

impl Target {
    pub fn locked(&self) -> bool {
        self.fixed.is_some()
    }
}

fn some_if_filled(text: &str) -> Option<String> {
    let t = text.trim();
    (!t.is_empty()).then(|| t.to_string())
}

/// Apply the precedence to one target.
pub fn resolve(inputs: &Inputs) -> Target {
    if let Some(f) = &inputs.fixed {
        return Target {
            value: some_if_filled(&f.value),
            layer: Layer::Configuration,
            fixed: Some(f.clone()),
        };
    }
    if let Some(s) = &inputs.stored {
        return Target {
            value: some_if_filled(s),
            layer: Layer::Page,
            fixed: None,
        };
    }
    if let Some(c) = inputs.code.as_deref().and_then(some_if_filled) {
        return Target {
            value: Some(c),
            layer: Layer::Code,
            fixed: None,
        };
    }
    Target {
        value: None,
        layer: Layer::Default,
        fixed: None,
    }
}

/// An address the kit will send to: http or https, a host, no blanks, a sane
/// length. An empty string is not an address; callers treat it as "no target"
/// before they get here.
pub fn check_url(raw: &str) -> Result<String, Error> {
    let url = raw.trim();
    let refuse = |why: String| {
        Error::invalid(
            why,
            "type an address such as http://hub.example:8080/t/ops.alerts (a kyu topic) or the full Home Assistant webhook address",
        )
    };
    if url.len() > MAX_URL_BYTES {
        return Err(refuse(format!(
            "the address is {} characters; the longest accepted is {MAX_URL_BYTES}",
            url.len()
        )));
    }
    if url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(refuse(
            "the address contains a space or a control character".into(),
        ));
    }
    let Some((scheme, rest)) = url.split_once("://") else {
        return Err(refuse(
            "the address must start with http:// or https://".into(),
        ));
    };
    if !matches!(scheme.to_ascii_lowercase().as_str(), "http" | "https") {
        return Err(refuse(format!(
            "the address starts with {scheme}://; only http:// and https:// are sent to"
        )));
    }
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.rsplit('@').next().unwrap_or(host);
    if host.is_empty() || host.starts_with(':') {
        return Err(refuse("the address has no host after http://".into()));
    }
    Ok(url.to_string())
}

/// kyu's damping contract: a repeat of the same key inside the window is not
/// stored again. Success messages send no key.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct Dedup {
    /// 1 to 200 printable ASCII characters, e.g. `backup|disk vol`.
    pub key: String,
    /// A number of ms, or a number with ms, s, m, h or d; at most 7d.
    /// `None` leaves kyu's default (24h).
    pub window: Option<String>,
}

/// The longest window kyu accepts, in milliseconds.
const MAX_WINDOW_MS: u64 = 7 * 24 * 3600 * 1000;

impl Dedup {
    pub fn new(key: impl Into<String>, window: Option<&str>) -> Result<Dedup, Error> {
        let key = key.into();
        let bad = |why: String| {
            Error::invalid(
                why,
                "use a key of 1 to 200 printable ASCII characters and a window such as 30m, 6h or 2d (at most 7d)",
            )
        };
        if key.is_empty() || key.len() > 200 || !key.bytes().all(|b| (0x20..=0x7e).contains(&b)) {
            return Err(bad(
                "the dedup key must be 1 to 200 printable ASCII characters".into(),
            ));
        }
        let window = match window.map(str::trim) {
            None => None,
            Some(w) => {
                let split = w.find(|c: char| !c.is_ascii_digit()).unwrap_or(w.len());
                let (num, unit) = w.split_at(split);
                let n: u64 = num.parse().map_err(|_| {
                    bad(format!(
                        "the dedup window `{w}` is not a number with an optional unit"
                    ))
                })?;
                let factor = match unit {
                    "" | "ms" => 1,
                    "s" => 1000,
                    "m" => 60_000,
                    "h" => 3_600_000,
                    "d" => 86_400_000,
                    other => {
                        return Err(bad(format!(
                            "the dedup window unit `{other}` is not ms, s, m, h or d"
                        )));
                    }
                };
                if n == 0 || n.saturating_mul(factor) > MAX_WINDOW_MS {
                    return Err(bad(format!(
                        "the dedup window `{w}` must be above zero and at most 7d"
                    )));
                }
                Some(w.to_string())
            }
        };
        Ok(Dedup { key, window })
    }
}

#[cfg(test)]
mod tests;
