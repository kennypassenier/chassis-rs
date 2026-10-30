//! `chassis clients` (K30): manage a service's client tokens over the same
//! JSON API the dashboard's buttons use, so a headless service
//! (http-switchboard, kyu-runner) gets a token for a caller like
//! Alertmanager without a browser.
//!
//! Three rules shape everything here. The admin token comes from an
//! environment variable, never argv (`ps` shows argv to every user on the
//! box) and never appears in an error or a log line. `issue`, `reissue`
//! and `reveal` print the token exactly once on stdout and nothing else
//! there, so `TOKEN="$(chassis clients issue …)"` works; every other line
//!
//! The parts: `verbs` (what each verb does and prints), `api` (the HTTP side),
//! `rows` (the client list, its table and the argument parsing) and `token`
//! (where the admin token comes from).

use std::io::Write;
use std::time::Duration;

use chassis::Error;
use clap::{Args, Subcommand};

mod api;
mod rows;
#[cfg(test)]
mod tests;
mod token;
mod verbs;

use api::Api;
use token::admin_token;

#[derive(Debug, Args)]
#[command(
    after_help = "The admin token is the service's <PREFIX>_TOKEN from its environment file. \
Export it under a name of your choosing and pass that name with --token-env; it is never \
accepted on the command line. `issue`, `reissue` and `reveal` print the token once on stdout \
and nothing else, so a script can capture it:\n\n    \
TOKEN=\"$(chassis clients issue alertmanager --url http://10.10.10.9:8080 --token-env SWITCHBOARD_TOKEN)\"\n\n\
Exit codes: 0 done, 1 refused or failed (the reason and what to do next are on stderr), 2 usage."
)]
pub struct ClientsArgs {
    #[command(subcommand)]
    pub verb: Verb,
    /// The service's base URL, e.g. http://10.10.10.9:8080
    #[arg(long, global = true, value_name = "BASE_URL")]
    pub url: Option<String>,
    /// Environment variable holding the service's admin token [default: CHASSIS_TOKEN]
    #[arg(long, global = true, value_name = "VAR")]
    pub token_env: Option<String>,
    /// Print the API's JSON on stdout instead of the human lines
    #[arg(long, global = true)]
    pub json: bool,
    /// Give up on the service after this many seconds
    #[arg(long, global = true, default_value_t = 10, value_name = "SECS")]
    pub timeout_secs: u64,
}

#[derive(Debug, Subcommand)]
pub enum Verb {
    /// List the clients (never their tokens)
    List,
    /// Issue a token for a new client and print it once
    Issue {
        /// The client's name: 1–64 of letters, digits, `.`, `_`, `-`
        name: String,
        /// Extra issue-form field the service declares, as key=value (repeatable)
        #[arg(long = "field", value_name = "KEY=VALUE")]
        fields: Vec<String>,
    },
    /// Replace a client's token and print the new one once; the old one stops working at once
    Reissue {
        /// The client's id or exact name
        client: String,
    },
    /// Revoke a client's token; that client is locked out immediately, the name is free again
    Revoke {
        /// The client's id or exact name
        client: String,
    },
    /// Delete a client and its request history (revoked clients too)
    Delete {
        /// The client's id or exact name
        client: String,
    },
    /// Print a client's current token once
    Reveal {
        /// The client's id or exact name
        client: String,
    },
}

/// Entry point from `main`: usage mistakes exit 2 here, everything else
/// is an `Error` that `main` prints and turns into exit 1.
pub fn run(args: ClientsArgs) -> Result<(), Error> {
    let Some(url) = args.url.as_deref() else {
        usage(
            "--url <BASE_URL> is required. What now: pass the service's base URL, e.g. --url http://10.10.10.9:8080",
        );
    };
    let (var, token) = admin_token(args.token_env.as_deref(), |name| std::env::var(name).ok())?;
    let api = Api::new(url, var, token, Duration::from_secs(args.timeout_secs))?;
    let out = std::io::stdout();
    let mut out = out.lock();
    let json = args.json;
    match args.verb {
        Verb::List => verbs::list(&api, json, &mut out)?,
        Verb::Issue { name, fields } => verbs::issue(&api, json, &name, &fields, &mut out)?,
        Verb::Reissue { client } => verbs::reissue(&api, json, &client, &mut out)?,
        Verb::Revoke { client } => verbs::revoke(&api, json, &client, &mut out)?,
        Verb::Delete { client } => verbs::delete(&api, json, &client, &mut out)?,
        Verb::Reveal { client } => verbs::reveal(&api, json, &client, &mut out)?,
    }
    out.flush().ok();
    Ok(())
}

/// A usage mistake: clap's own exit code (2) so scripts can tell it from
/// a refusal by the service (1).
pub(super) fn usage(message: impl std::fmt::Display) -> ! {
    clap::Error::raw(
        clap::error::ErrorKind::InvalidValue,
        format!("error: {message}\n"),
    )
    .exit()
}
