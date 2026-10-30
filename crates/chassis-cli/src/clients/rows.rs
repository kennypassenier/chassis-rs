//! The client list as the service returns it, and the two pieces of text
//! handling around it: the `--field key=value` arguments going in, and the
//! table coming out. Pure functions, so they are tested without a service.

use std::collections::BTreeMap;

use chassis::{Error, Kind};
use serde::Deserialize;

/// A client as `GET /api/clients` lists it (the kit's `ClientView`),
/// mirrored here because the CLI compiles the kit without `dashboard`.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub(super) struct ClientRow {
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

/// `--field key=value` pairs → the flat JSON keys `POST /api/clients`
/// takes next to `name` (K16 form fields).
pub(super) fn parse_fields(fields: &[String]) -> Result<BTreeMap<String, String>, Error> {
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
pub(super) fn resolve<'a>(arg: &str, clients: &'a [ClientRow]) -> Result<&'a ClientRow, Error> {
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
pub(super) fn table(rows: &[ClientRow]) -> String {
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
pub(super) fn short_time(rfc3339: &str) -> String {
    if rfc3339.len() >= 16 && rfc3339.as_bytes()[10] == b'T' {
        format!("{} {}", &rfc3339[..10], &rfc3339[11..16])
    } else {
        rfc3339.to_string()
    }
}
