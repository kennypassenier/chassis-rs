//! A title and a link on a notification (`[notify-link-1]`), as pure data.
//!
//! `Event` is a public struct callers build with a struct literal, so it
//! cannot grow a field without a major release. The two optional fields
//! travel beside it in a [`Link`] and are merged into the JSON body at the
//! last moment ([`body_json`]). Without a link the body is byte for byte
//! what it always was.
//!
//! A link is validated when it is built, so a bad one is refused where the
//! app writes it and never reaches the queue:
//!
//! * `url`: a path of the app (`/tasks/42`, starts with a single `/`) or an
//!   absolute `http(s)` address.
//! * `title`: one line of text, at most [`MAX_TITLE_CHARS`] characters.

use serde::Serialize;

use crate::core::error::Error;
use crate::core::notify::Event;
use crate::core::notify_target::{MAX_URL_BYTES, check_url};

/// The longest title accepted, in characters.
pub const MAX_TITLE_CHARS: usize = 200;

/// The optional title and link of one notification. Build it with
/// [`Link::new`] or [`Link::to`]; the fields are checked there.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct Link {
    pub title: Option<String>,
    pub url: Option<String>,
}

fn refuse(why: String) -> Error {
    Error::invalid(
        why,
        "give a url that is a path of the app such as /tasks/42 or a full http(s) address, and a one-line title",
    )
}

/// A path of the app, or an absolute http(s) address.
fn check_target(raw: &str) -> Result<String, Error> {
    let url = raw.trim();
    if url.starts_with('/') {
        if url.starts_with("//") {
            return Err(refuse(format!(
                "the link `{url}` starts with `//`, which a browser reads as another host; use /path or a full http(s) address"
            )));
        }
        if url.len() > MAX_URL_BYTES {
            return Err(refuse(format!(
                "the link is {} characters; the longest accepted is {MAX_URL_BYTES}",
                url.len()
            )));
        }
        if url.chars().any(|c| c.is_whitespace() || c.is_control()) {
            return Err(refuse(
                "the link contains a space or a control character".into(),
            ));
        }
        return Ok(url.to_string());
    }
    check_url(url).map_err(|e| {
        refuse(format!(
            "the link is neither a path of the app nor an http(s) address: {}",
            e.message
        ))
    })
}

fn check_title(raw: &str) -> Result<String, Error> {
    let title = raw.trim();
    if title.is_empty() {
        return Err(refuse("the title is empty".into()));
    }
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(refuse(format!(
            "the title is longer than {MAX_TITLE_CHARS} characters"
        )));
    }
    if title.chars().any(char::is_control) {
        return Err(refuse("the title must be one line of plain text".into()));
    }
    Ok(title.to_string())
}

impl Link {
    /// A title, a url, or both. At least one is required.
    pub fn new(title: Option<&str>, url: Option<&str>) -> Result<Link, Error> {
        if title.is_none() && url.is_none() {
            return Err(refuse("a link needs a title, a url or both".into()));
        }
        Ok(Link {
            title: title.map(check_title).transpose()?,
            url: url.map(check_target).transpose()?,
        })
    }

    /// A link without a title.
    pub fn to(url: &str) -> Result<Link, Error> {
        Link::new(None, Some(url))
    }
}

/// The wire form: the event's fields in their usual order, then `title` and
/// `url` when set. Also the context a `[[notify.webhook]]` body template sees.
#[derive(Serialize)]
pub(crate) struct Wire<'a> {
    #[serde(flatten)]
    pub event: &'a Event,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<&'a str>,
}

impl<'a> Wire<'a> {
    pub(crate) fn new(event: &'a Event, link: Option<&'a Link>) -> Self {
        Wire {
            event,
            title: link.and_then(|l| l.title.as_deref()),
            url: link.and_then(|l| l.url.as_deref()),
        }
    }
}

/// The JSON body of one notification.
pub fn body_json(event: &Event, link: Option<&Link>) -> String {
    serde_json::to_string(&Wire::new(event, link)).expect("event serialises")
}

#[cfg(test)]
mod tests;
