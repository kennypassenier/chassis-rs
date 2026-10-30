//! Where the admin token comes from: an environment variable, never argv, and
//! never echoed. Its own module because the rule is a security boundary of
//! the command, not a detail of any verb.

use chassis::Error;
use secrecy::SecretString;
use serde_json::Value;

/// Read when `--token-env` is not given.
pub const DEFAULT_TOKEN_ENV: &str = "CHASSIS_TOKEN";

/// The `token` field of a reveal answer.
pub(super) fn token_of(reveal: &Value) -> Result<String, Error> {
    reveal["token"].as_str().map(str::to_string).ok_or_else(|| {
        Error::dependency(
            "the service's reveal answer carries no `token` field",
            "is --url a chassis service of 1.0.0 or later? compare its /healthz",
        )
    })
}

/// Which variable holds the admin token, and its value. `env` is injected
/// so a test never reads or writes the process environment.
pub(super) fn admin_token(
    token_env: Option<&str>,
    env: impl Fn(&str) -> Option<String>,
) -> Result<(String, SecretString), Error> {
    let var = token_env.unwrap_or(DEFAULT_TOKEN_ENV);
    match env(var) {
        Some(v) if !v.trim().is_empty() => {
            Ok((var.to_string(), SecretString::from(v.trim().to_string())))
        }
        _ => {
            let remedy = if token_env.is_some() {
                format!(
                    "export the service's admin token (its <PREFIX>_TOKEN from the environment file) as {var} in this shell; the token is never accepted on the command line"
                )
            } else {
                format!(
                    "export the service's admin token (its <PREFIX>_TOKEN from the environment file) as {var}, or name the variable that holds it with --token-env <VAR>; the token is never accepted on the command line"
                )
            };
            Err(Error::config(
                format!(
                    "the environment variable {var} is not set, so there is no admin token to send"
                ),
                remedy,
            ))
        }
    }
}
