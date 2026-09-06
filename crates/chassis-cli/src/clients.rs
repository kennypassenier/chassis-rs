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
//! goes to stderr. Every refusal names a remedy (K3).

use std::collections::BTreeMap;
use std::io::Write;
use std::time::Duration;

use chassis::{Error, Kind};
use clap::{Args, Subcommand};
use reqwest::blocking::Client;
use reqwest::{Method, StatusCode};
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;
use serde_json::Value;

/// Read when `--token-env` is not given.
pub const DEFAULT_TOKEN_ENV: &str = "CHASSIS_TOKEN";

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
    /// Revoke a client's token; the caller is locked out immediately, the name is free again
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

/// A client as `GET /api/clients` lists it (the kit's `ClientView`),
/// mirrored here because the CLI compiles the kit without `dashboard`.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct ClientRow {
    pub id: String,
    pub name: String,
    pub active: bool,
    #[serde(default)]
    pub issued_at: String,
    #[serde(default)]
    pub revoked_at: Option<String>,
    #[serde(default)]
    pub last_used_at: Option<String>,
    #[serde(default)]
    pub uses: u64,
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
    match args.verb {
        Verb::List => {
            let (raw, rows) = api.list()?;
            if args.json {
                writeln!(out, "{raw}").ok();
            } else {
                write!(out, "{}", table(&rows)).ok();
            }
        }
        Verb::Issue { name, fields } => {
            let fields = match parse_fields(&fields) {
                Ok(f) => f,
                Err(e) => usage(e),
            };
            let (view, token) = api.issue(&name, &fields)?;
            print_token(&mut out, args.json, &view, &token)?;
            eprintln!(
                "issued a token for client `{}` (id {})",
                view["name"].as_str().unwrap_or(&name),
                view["id"].as_str().unwrap_or("?")
            );
        }
        Verb::Reissue { client } => {
            let (_, rows) = api.list()?;
            let row = resolve(&client, &rows)?;
            let (view, token) = api.reissue(&row.id)?;
            print_token(&mut out, args.json, &view, &token)?;
            eprintln!(
                "re-issued the token of client `{}` (id {}); the previous token is refused from now on",
                row.name, row.id
            );
        }
        Verb::Revoke { client } => {
            let (_, rows) = api.list()?;
            let row = resolve(&client, &rows)?;
            let view = api.post(&format!("/api/clients/{}/revoke", row.id))?;
            if args.json {
                writeln!(out, "{view}").ok();
            }
            eprintln!(
                "revoked client `{}` (id {}); its token is refused from now on and the name is free again",
                row.name, row.id
            );
        }
        Verb::Delete { client } => {
            let (_, rows) = api.list()?;
            let row = resolve(&client, &rows)?;
            api.delete(&row.id)?;
            if args.json {
                writeln!(
                    out,
                    "{}",
                    serde_json::json!({"id": row.id, "name": row.name, "deleted": true})
                )
                .ok();
            }
            eprintln!(
                "deleted client `{}` (id {}) and its request history",
                row.name, row.id
            );
        }
        Verb::Reveal { client } => {
            let (_, rows) = api.list()?;
            let row = resolve(&client, &rows)?;
            let reveal = api.reveal(&row.id)?;
            if args.json {
                writeln!(out, "{reveal}").ok();
            } else {
                writeln!(out, "{}", token_of(&reveal)?).ok();
            }
        }
    }
    out.flush().ok();
    Ok(())
}

/// A usage mistake: clap's own exit code (2) so scripts can tell it from
/// a refusal by the service (1).
fn usage(message: impl std::fmt::Display) -> ! {
    clap::Error::raw(
        clap::error::ErrorKind::InvalidValue,
        format!("error: {message}\n"),
    )
    .exit()
}

/// The token on stdout, once — or the view with the token folded in when
/// the caller asked for JSON.
fn print_token(
    out: &mut impl Write,
    json: bool,
    view: &Value,
    token: &SecretString,
) -> Result<(), Error> {
    if json {
        let mut merged = view.clone();
        if let Some(obj) = merged.as_object_mut() {
            obj.insert(
                "token".to_string(),
                Value::String(token.expose_secret().to_string()),
            );
        }
        writeln!(out, "{merged}").ok();
    } else {
        writeln!(out, "{}", token.expose_secret()).ok();
    }
    Ok(())
}

fn token_of(reveal: &Value) -> Result<String, Error> {
    reveal["token"].as_str().map(str::to_string).ok_or_else(|| {
        Error::dependency(
            "the service's reveal answer carries no `token` field",
            "is --url a chassis service of 1.0.0 or later? compare its /healthz",
        )
    })
}

/// Which variable holds the admin token, and its value. `env` is injected
/// so a test never reads or writes the process environment.
pub fn admin_token(
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

/// `--field key=value` pairs → the flat JSON keys `POST /api/clients`
/// takes next to `name` (K16 form fields).
pub fn parse_fields(fields: &[String]) -> Result<BTreeMap<String, String>, Error> {
    let mut map = BTreeMap::new();
    for raw in fields {
        let Some((key, value)) = raw.split_once('=') else {
            return Err(Error::invalid(
                format!("--field `{raw}` has no `=`"),
                "write it as --field key=value, e.g. --field calendar=cal-1",
            ));
        };
        let key = key.trim();
        if key.is_empty() {
            return Err(Error::invalid(
                format!("--field `{raw}` has an empty key"),
                "write it as --field key=value, e.g. --field calendar=cal-1",
            ));
        }
        if key == "name" {
            return Err(Error::invalid(
                "--field name=… would replace the client's name",
                "the name is the positional argument: chassis clients issue <NAME>",
            ));
        }
        if map.insert(key.to_string(), value.to_string()).is_some() {
            return Err(Error::invalid(
                format!("--field {key} is given twice"),
                "keep one value per field",
            ));
        }
    }
    Ok(map)
}

/// An id matches first; otherwise the exact name, preferring the one
/// active client when revoked namesakes exist (a revoked client frees its
/// name, so a list may carry several).
pub fn resolve<'a>(arg: &str, clients: &'a [ClientRow]) -> Result<&'a ClientRow, Error> {
    if let Some(c) = clients.iter().find(|c| c.id == arg) {
        return Ok(c);
    }
    let named: Vec<&ClientRow> = clients.iter().filter(|c| c.name == arg).collect();
    match named.as_slice() {
        [] => Err(Error::new(
            Kind::NotFound,
            format!("no client has the id or the name `{arg}`"),
            "list them with `chassis clients list`; names must match exactly, ids are the first column",
        )),
        [one] => Ok(one),
        many => {
            let active: Vec<&&ClientRow> = many.iter().filter(|c| c.active).collect();
            if let [one] = active.as_slice() {
                return Ok(one);
            }
            let ids: Vec<&str> = many.iter().map(|c| c.id.as_str()).collect();
            Err(Error::invalid(
                format!("{} clients are named `{arg}`", many.len()),
                format!("use the id instead: {}", ids.join(", ")),
            ))
        }
    }
}

/// The human list: one line per client, widest column wins.
pub fn table(rows: &[ClientRow]) -> String {
    if rows.is_empty() {
        return "no clients yet; `chassis clients issue <NAME>` creates one\n".to_string();
    }
    let header = ["ID", "NAME", "STATE", "ISSUED", "LAST USED", "USES"];
    let cells: Vec<[String; 6]> = rows
        .iter()
        .map(|r| {
            [
                r.id.clone(),
                r.name.clone(),
                if r.active {
                    "active".to_string()
                } else {
                    "revoked".to_string()
                },
                short_time(&r.issued_at),
                r.last_used_at
                    .as_deref()
                    .map(short_time)
                    .unwrap_or_else(|| "never".to_string()),
                r.uses.to_string(),
            ]
        })
        .collect();
    let mut widths: Vec<usize> = header.iter().map(|h| h.chars().count()).collect();
    for row in &cells {
        for (w, cell) in widths.iter_mut().zip(row.iter()) {
            *w = (*w).max(cell.chars().count());
        }
    }
    let line = |cols: &[&str]| -> String {
        let mut s = String::new();
        for (i, (c, w)) in cols.iter().zip(&widths).enumerate() {
            if i > 0 {
                s.push_str("  ");
            }
            if i == cols.len() - 1 {
                s.push_str(c);
            } else {
                s.push_str(&format!("{c:<w$}"));
            }
        }
        s.trim_end().to_string() + "\n"
    };
    let mut out = line(&header);
    for row in &cells {
        let refs: Vec<&str> = row.iter().map(String::as_str).collect();
        out.push_str(&line(&refs));
    }
    out
}

/// `2026-09-06T21:35:12Z` → `2026-09-06 21:35`; anything else unchanged.
fn short_time(rfc3339: &str) -> String {
    if rfc3339.len() >= 16 && rfc3339.as_bytes()[10] == b'T' {
        format!("{} {}", &rfc3339[..10], &rfc3339[11..16])
    } else {
        rfc3339.to_string()
    }
}

/// The HTTP side: one client, the base URL, the token, and the mapping
/// from the service's answers to errors with remedies.
struct Api {
    http: Client,
    base: String,
    var: String,
    token: SecretString,
}

impl Api {
    fn new(url: &str, var: String, token: SecretString, timeout: Duration) -> Result<Self, Error> {
        let base = url.trim_end_matches('/').to_string();
        if !(base.starts_with("http://") || base.starts_with("https://")) {
            usage(format!(
                "--url `{url}` must start with http:// or https://. What now: pass the service's base URL, e.g. --url http://10.10.10.9:8080"
            ));
        }
        // No redirects: a kit older than this command answers a wrong
        // bearer with a redirect to /login, and following it would turn a
        // 401 into a 200 login page.
        let http = Client::builder()
            .timeout(timeout)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| {
                Error::internal(
                    format!("could not build the HTTP client: {e}"),
                    "report this with the exact command",
                )
            })?;
        Ok(Api {
            http,
            base,
            var,
            token,
        })
    }

    fn list(&self) -> Result<(Value, Vec<ClientRow>), Error> {
        let raw = self.call(Method::GET, "/api/clients", None)?;
        let rows: Vec<ClientRow> = serde_json::from_value(raw.clone()).map_err(|e| {
            Error::dependency(
                format!("the service's client list is not in the kit's shape: {e}"),
                format!(
                    "is {} a chassis service with the dashboard feature? `GET /api/clients` should answer a JSON array",
                    self.base
                ),
            )
        })?;
        Ok((raw, rows))
    }

    fn issue(
        &self,
        name: &str,
        fields: &BTreeMap<String, String>,
    ) -> Result<(Value, SecretString), Error> {
        let mut body = serde_json::Map::new();
        body.insert("name".to_string(), Value::String(name.to_string()));
        for (k, v) in fields {
            body.insert(k.clone(), Value::String(v.clone()));
        }
        let view = self.call(Method::POST, "/api/clients", Some(Value::Object(body)))?;
        let id = view["id"].as_str().ok_or_else(|| {
            Error::dependency(
                "the service issued a client but its answer carries no `id`",
                "list the clients with `chassis clients list`; the token can be read with `chassis clients reveal <NAME>`",
            )
        })?;
        let token = token_of(&self.reveal(id)?)?;
        Ok((view, SecretString::from(token)))
    }

    fn reissue(&self, id: &str) -> Result<(Value, SecretString), Error> {
        let view = self.post(&format!("/api/clients/{id}/reissue"))?;
        let token = token_of(&self.reveal(id)?)?;
        Ok((view, SecretString::from(token)))
    }

    fn reveal(&self, id: &str) -> Result<Value, Error> {
        self.call(Method::GET, &format!("/api/clients/{id}/token"), None)
    }

    fn post(&self, path: &str) -> Result<Value, Error> {
        self.call(Method::POST, path, None)
    }

    fn delete(&self, id: &str) -> Result<(), Error> {
        self.call(Method::DELETE, &format!("/api/clients/{id}"), None)
            .map(|_| ())
    }

    /// One request; a 2xx answer as JSON (`null` for an empty body),
    /// anything else as an error whose remedy fits the status.
    fn call(&self, method: Method, path: &str, body: Option<Value>) -> Result<Value, Error> {
        let url = format!("{}{}", self.base, path);
        let mut req = self
            .http
            .request(method.clone(), &url)
            .bearer_auth(self.token.expose_secret());
        if let Some(b) = body {
            req = req.json(&b);
        }
        let res = req.send().map_err(|e| self.transport_error(&e))?;
        let status = res.status();
        let location = res
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let text = res.text().unwrap_or_default();
        if status.is_success() {
            if text.trim().is_empty() {
                return Ok(Value::Null);
            }
            return serde_json::from_str(&text).map_err(|e| {
                Error::dependency(
                    format!("{method} {path} answered {status} but not JSON: {e}"),
                    format!("is {} a chassis service? compare its /healthz", self.base),
                )
            });
        }
        let api_error: Option<(String, String)> =
            serde_json::from_str::<Value>(&text).ok().and_then(|v| {
                Some((
                    v["error"].as_str()?.to_string(),
                    v["remedy"].as_str()?.to_string(),
                ))
            });
        // A redirect to the login page is what a kit before 1.8.0 answers
        // a wrong bearer with: the same fact as a 401.
        if status == StatusCode::UNAUTHORIZED
            || (status.is_redirection() && location.contains("/login"))
        {
            return Err(Error::new(
                Kind::Unauthorized,
                format!("{} refused the token in ${}", self.base, self.var),
                format!(
                    "the token in ${} is not this service's admin token: it must be the <PREFIX>_TOKEN from the environment file of the service at {}, not a client token; check that --url points at the intended service",
                    self.var, self.base
                ),
            ));
        }
        if status == StatusCode::NOT_FOUND {
            return Err(match api_error {
                Some((message, _)) if path != "/api/clients" => Error::new(
                    Kind::NotFound,
                    message,
                    "the client is gone since the list was read; list them again with `chassis clients list`",
                ),
                _ => Error::new(
                    Kind::NotFound,
                    format!("{} has no {path}", self.base),
                    "is --url the service's base URL (no path), and is the dashboard feature compiled into it? compare its /healthz",
                ),
            });
        }
        match api_error {
            // The service's own refusal (a duplicate name, a project hook
            // saying no) already carries its remedy.
            Some((message, remedy)) => Err(Error::new(kind_of(status), message, remedy)),
            None => Err(Error::dependency(
                format!(
                    "{method} {path} answered {status}{}",
                    if text.trim().is_empty() {
                        String::new()
                    } else {
                        format!(": {}", text.trim())
                    }
                ),
                format!(
                    "read the service's log at {}; compare its /healthz",
                    self.base
                ),
            )),
        }
    }

    fn transport_error(&self, e: &reqwest::Error) -> Error {
        if e.is_timeout() {
            return Error::dependency(
                format!("{} did not answer within the timeout", self.base),
                "is the service healthy? check its /healthz, or raise --timeout-secs",
            );
        }
        // The chain carries the cause (`Connection refused`, a DNS failure);
        // reqwest's top line only names the URL.
        let mut chain = e.to_string();
        let mut source = std::error::Error::source(e);
        while let Some(s) = source {
            chain.push_str(": ");
            chain.push_str(&s.to_string());
            source = s.source();
        }
        Error::dependency(
            format!("could not reach {}: {chain}", self.base),
            format!(
                "is the service running at {}? compare the address with its `--print-config` (the listen knob) and the reverse proxy in front of it",
                self.base
            ),
        )
    }
}

fn kind_of(status: StatusCode) -> Kind {
    match status.as_u16() {
        400 => Kind::Invalid,
        401 | 403 => Kind::Unauthorized,
        404 => Kind::NotFound,
        429 | 503 => Kind::Overloaded,
        _ => Kind::Dependency,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: &str, name: &str, active: bool) -> ClientRow {
        ClientRow {
            id: id.to_string(),
            name: name.to_string(),
            active,
            issued_at: "2026-09-06T21:35:12Z".to_string(),
            revoked_at: if active {
                None
            } else {
                Some("2026-09-07T08:00:00Z".to_string())
            },
            last_used_at: None,
            uses: 0,
        }
    }

    // Drilled red once: refusing `name` was removed and the third assert failed.
    #[test]
    fn k30_fields_parse_as_key_value_and_refuse_what_would_break_the_form() {
        let ok = parse_fields(&["calendar=cal-1".into(), "note=a=b".into()]).unwrap();
        assert_eq!(ok.get("calendar").unwrap(), "cal-1");
        assert_eq!(ok.get("note").unwrap(), "a=b", "only the first `=` splits");
        let err = parse_fields(&["name=other".into()]).unwrap_err();
        assert!(err.remedy.contains("positional"), "{err}");
        let err = parse_fields(&["calendar".into()]).unwrap_err();
        assert!(err.remedy.contains("--field key=value"), "{err}");
        let err = parse_fields(&["=x".into()]).unwrap_err();
        assert!(err.message.contains("empty key"), "{err}");
        let err = parse_fields(&["a=1".into(), "a=2".into()]).unwrap_err();
        assert!(err.message.contains("twice"), "{err}");
        assert!(parse_fields(&[]).unwrap().is_empty());
    }

    // Drilled red once: the default name was changed and the first assert failed.
    #[test]
    fn k30_the_token_comes_from_the_named_variable_or_the_default_and_never_argv() {
        let env = |name: &str| match name {
            "CHASSIS_TOKEN" => Some("default-token".to_string()),
            "SWITCHBOARD_TOKEN" => Some(" named-token \n".to_string()),
            "EMPTY" => Some("   ".to_string()),
            _ => None,
        };
        let (var, token) = admin_token(None, env).unwrap();
        assert_eq!(var, "CHASSIS_TOKEN");
        assert_eq!(token.expose_secret(), "default-token");
        let (var, token) = admin_token(Some("SWITCHBOARD_TOKEN"), env).unwrap();
        assert_eq!(var, "SWITCHBOARD_TOKEN");
        assert_eq!(token.expose_secret(), "named-token", "trimmed");
        // Missing or blank: a refusal that names the variable and the flag,
        // and no token value anywhere in it.
        let err = admin_token(Some("MISSING"), env).unwrap_err();
        assert_eq!(err.kind, Kind::Config);
        assert!(err.message.contains("MISSING"), "{err}");
        assert!(
            err.remedy.contains("never accepted on the command line"),
            "{err}"
        );
        let err = admin_token(Some("EMPTY"), env).unwrap_err();
        assert!(err.message.contains("EMPTY is not set"), "{err}");
        let err = admin_token(None, |_| None).unwrap_err();
        assert!(err.remedy.contains("--token-env"), "{err}");
        // A secret never prints itself.
        let (_, token) = admin_token(None, env).unwrap();
        assert!(!format!("{token:?}").contains("default-token"));
    }

    // Drilled red once: the id lookup was skipped and the first assert failed.
    #[test]
    fn k30_id_or_name_resolves_over_a_fixed_list() {
        let list = vec![
            row("11111111-1111-4111-8111-111111111111", "alertmanager", true),
            row("22222222-2222-4222-8222-222222222222", "grafana", false),
            row("33333333-3333-4333-8333-333333333333", "grafana", true),
            row("44444444-4444-4444-8444-444444444444", "old", false),
            row("55555555-5555-4555-8555-555555555555", "old", false),
        ];
        assert_eq!(
            resolve("11111111-1111-4111-8111-111111111111", &list)
                .unwrap()
                .name,
            "alertmanager"
        );
        assert_eq!(resolve("alertmanager", &list).unwrap().id, list[0].id);
        // Two namesakes, one active: the active one is meant.
        assert_eq!(resolve("grafana", &list).unwrap().id, list[2].id);
        // Two revoked namesakes: ambiguous, the remedy lists both ids.
        let err = resolve("old", &list).unwrap_err();
        assert_eq!(err.kind, Kind::Invalid);
        assert!(
            err.remedy.contains(&list[3].id) && err.remedy.contains(&list[4].id),
            "{err}"
        );
        // Unknown: not found, with the list command as the remedy.
        let err = resolve("nobody", &list).unwrap_err();
        assert_eq!(err.kind, Kind::NotFound);
        assert!(err.remedy.contains("chassis clients list"), "{err}");
        // Names match exactly, never by prefix or case.
        assert!(resolve("alert", &list).is_err());
        assert!(resolve("Alertmanager", &list).is_err());
    }

    // Drilled red once: the STATE column was renamed and the header assert failed.
    #[test]
    fn k30_the_table_aligns_columns_and_shortens_times() {
        let mut revoked = row("22222222-2222-4222-8222-222222222222", "grafana", false);
        revoked.last_used_at = Some("2026-09-06T22:01:00Z".to_string());
        revoked.uses = 42;
        let list = vec![
            row("11111111-1111-4111-8111-111111111111", "alertmanager", true),
            revoked,
        ];
        let t = table(&list);
        let lines: Vec<&str> = t.lines().collect();
        assert_eq!(lines.len(), 3, "{t}");
        assert!(lines[0].starts_with("ID"), "{t}");
        assert!(
            lines[0].contains("STATE") && lines[0].contains("LAST USED"),
            "{t}"
        );
        assert!(
            lines[1].contains("alertmanager  active   2026-09-06 21:35  never             0"),
            "{t}"
        );
        assert!(
            lines[2].contains("grafana       revoked  2026-09-06 21:35  2026-09-06 22:01  42"),
            "{t}"
        );
        // Every ID starts at the same column as the header's.
        let name_col = lines[0].find("NAME").unwrap();
        assert!(lines[1][name_col..].starts_with("alertmanager"), "{t}");
        assert!(lines[2][name_col..].starts_with("grafana"), "{t}");
        assert!(table(&[]).contains("no clients yet"));
        assert_eq!(short_time("garbage"), "garbage");
    }

    // Drilled red once: 401 was mapped to Dependency and the kind assert failed.
    #[test]
    fn k30_statuses_map_to_the_kits_kinds() {
        assert_eq!(kind_of(StatusCode::BAD_REQUEST), Kind::Invalid);
        assert_eq!(kind_of(StatusCode::UNAUTHORIZED), Kind::Unauthorized);
        assert_eq!(kind_of(StatusCode::NOT_FOUND), Kind::NotFound);
        assert_eq!(kind_of(StatusCode::TOO_MANY_REQUESTS), Kind::Overloaded);
        assert_eq!(kind_of(StatusCode::BAD_GATEWAY), Kind::Dependency);
    }
}
