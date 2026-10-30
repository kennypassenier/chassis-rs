//! How the dashboard words its error pages: capitalised sentences, the
//! drawing and the plain reason per status, and the template-error wrapper.
//! Its own module because it is presentation text with no state.

use super::*;

/// The kit writes its errors and remedies as lowercase fragments for a log
/// line and a JSON body; on a page they open a sentence.
pub(super) fn capitalised(text: &str) -> String {
    let text = text.trim();
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

/// [`capitalised`] and closed with a full stop; empty stays empty.
pub(super) fn sentence(text: &str) -> String {
    let mut out = capitalised(text);
    if !out.is_empty() && !out.ends_with(['.', '!', '?']) {
        out.push('.');
    }
    out
}

/// kit-kp11: the drawing and the plain reason an error page shows for a
/// status. The reason says what kind of thing happened, never an id or a
/// raw error; the kit's own remedy follows it on the page.
pub(super) fn error_look(status: StatusCode) -> (&'static str, &'static str) {
    match status.as_u16() {
        401 => ("locked", "You are not signed in, or the session has ended."),
        403 => (
            "locked",
            "The request came from an address or a page this service does not trust.",
        ),
        404 => (
            "nomatch",
            "It was moved or removed, or the address is not right.",
        ),
        413 => ("error", "The request is larger than this service accepts."),
        429 => ("offline", "Too many requests came in a short time."),
        502..=504 => ("offline", "A part this service needs did not answer."),
        500..=599 => ("error", "Something went wrong on the service’s side."),
        _ => ("error", "The service could not accept the request as sent."),
    }
}

pub(super) fn template_error(e: minijinja::Error) -> Error {
    Error::internal(
        format!("template error: {e}"),
        "this is a bug in the kit or in a project template; the message names the template and line",
    )
}
