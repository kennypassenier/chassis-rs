//! What each `chassis clients` verb does and prints: the token on stdout once
//! (or the JSON the caller asked for) and the human line on stderr. Split from
//! the entry point so each verb reads as its own short function.

use std::io::Write;

use chassis::Error;
use secrecy::{ExposeSecret, SecretString};
use serde_json::Value;

use super::api::Api;
use super::rows::{parse_fields, resolve, table};
use super::token::token_of;
use super::usage;

pub(super) fn list(api: &Api, json: bool, out: &mut impl Write) -> Result<(), Error> {
    let (raw, rows) = api.list()?;
    if json {
        writeln!(out, "{raw}").ok();
    } else {
        write!(out, "{}", table(&rows)).ok();
    }
    Ok(())
}

pub(super) fn issue(
    api: &Api,
    json: bool,
    name: &str,
    fields: &[String],
    out: &mut impl Write,
) -> Result<(), Error> {
    let fields = match parse_fields(fields) {
        Ok(f) => f,
        Err(e) => usage(e),
    };
    let (view, token) = api.issue(name, &fields)?;
    print_token(out, json, &view, &token)?;
    eprintln!(
        "issued a token for client `{}` (id {})",
        view["name"].as_str().unwrap_or(name),
        view["id"].as_str().unwrap_or("?")
    );
    Ok(())
}

pub(super) fn reissue(
    api: &Api,
    json: bool,
    client: &str,
    out: &mut impl Write,
) -> Result<(), Error> {
    let (_, rows) = api.list()?;
    let row = resolve(client, &rows)?;
    let (view, token) = api.reissue(&row.id)?;
    print_token(out, json, &view, &token)?;
    eprintln!(
        "re-issued the token of client `{}` (id {}); the previous token is refused from now on",
        row.name, row.id
    );
    Ok(())
}

pub(super) fn revoke(
    api: &Api,
    json: bool,
    client: &str,
    out: &mut impl Write,
) -> Result<(), Error> {
    let (_, rows) = api.list()?;
    let row = resolve(client, &rows)?;
    let view = api.post(&format!("/api/clients/{}/revoke", row.id))?;
    if json {
        writeln!(out, "{view}").ok();
    }
    eprintln!(
        "revoked client `{}` (id {}); its token is refused from now on and the name is free again",
        row.name, row.id
    );
    Ok(())
}

pub(super) fn delete(
    api: &Api,
    json: bool,
    client: &str,
    out: &mut impl Write,
) -> Result<(), Error> {
    let (_, rows) = api.list()?;
    let row = resolve(client, &rows)?;
    api.delete(&row.id)?;
    if json {
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
    Ok(())
}

pub(super) fn reveal(
    api: &Api,
    json: bool,
    client: &str,
    out: &mut impl Write,
) -> Result<(), Error> {
    let (_, rows) = api.list()?;
    let row = resolve(client, &rows)?;
    let reveal = api.reveal(&row.id)?;
    if json {
        writeln!(out, "{reveal}").ok();
    } else {
        writeln!(out, "{}", token_of(&reveal)?).ok();
    }
    Ok(())
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
