//! Logging setup (K4): `tracing` to stderr, filter from `<PREFIX>_LOG`,
//! text by default and JSON when asked.
//!
//! Text goes to stderr because under systemd that is journald, and the
//! homelab's Alloy ships journald to Loki with labels it sets itself; the
//! app has nothing to add. JSON is offered for the day Alloy parses it
//! (an open item with the Homelab Rust session), not because it helps
//! today.

use tracing_subscriber::EnvFilter;

use crate::core::error::Error;

/// How log lines are rendered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    Text,
    Json,
}

impl LogFormat {
    pub fn parse(s: &str) -> Result<Self, Error> {
        match s.trim().to_ascii_lowercase().as_str() {
            "text" | "" => Ok(LogFormat::Text),
            "json" => Ok(LogFormat::Json),
            other => Err(Error::config(
                format!("log format `{other}` is not one of text, json"),
                "set the log_format knob to text or json",
            )),
        }
    }
}

/// Install the global subscriber. Called once by `App`; a second call is
/// a no-op so tests that build several apps in one process do not panic.
pub fn init(filter: &str, format: LogFormat) -> Result<(), Error> {
    let env_filter = EnvFilter::try_new(filter).map_err(|e| {
        Error::config(
            format!("log filter `{filter}` is not valid: {e}"),
            "use a tracing filter such as `info` or `info,chassis=debug`",
        )
    })?;
    // Colour only on a terminal: under systemd stderr is journald, and
    // escape codes there are noise in every `journalctl` line and in
    // anything that parses the log (the L1 E2E test found it first).
    let ansi = std::io::IsTerminal::is_terminal(&std::io::stderr());
    let builder = tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_writer(std::io::stderr)
        .with_ansi(ansi)
        .with_target(false);
    let installed = match format {
        LogFormat::Text => builder.try_init().is_ok(),
        LogFormat::Json => builder.json().try_init().is_ok(),
    };
    if !installed {
        // Already initialised by an earlier App in this process (tests).
        tracing::debug!("logging already initialised; keeping the first subscriber");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_parses_case_insensitively_and_refuses_unknown() {
        assert_eq!(LogFormat::parse("JSON").unwrap(), LogFormat::Json);
        assert_eq!(LogFormat::parse("").unwrap(), LogFormat::Text);
        let err = LogFormat::parse("yaml").unwrap_err();
        assert!(err.remedy.contains("text or json"));
    }

    #[test]
    fn bad_filter_is_a_config_error_with_remedy() {
        let err = init("this is not [a filter", LogFormat::Text).unwrap_err();
        assert!(err.remedy.contains("tracing filter"));
    }
}
