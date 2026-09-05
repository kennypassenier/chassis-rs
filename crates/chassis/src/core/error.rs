//! The kit's error type: every error carries a remedy (K3, AR4).
//!
//! A remedy is the sentence that answers "what now?" — the thing the
//! reader does next. It is a constructor argument, not an optional
//! field, so an error without one cannot be built. Kinds map to HTTP
//! statuses in the shell; here they are only names.

use std::fmt;

/// What went wrong, coarsely: enough to pick a status code and a log
/// level, no more.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// A configuration or environment problem; the process should not
    /// start, or a request cannot be served until an operator acts.
    Config,
    /// The caller is not authenticated or not allowed.
    Unauthorized,
    /// The caller asked for something that does not exist.
    NotFound,
    /// The caller's input is malformed or violates a rule.
    Invalid,
    /// The service is overloaded or a limit was hit; retry later.
    Overloaded,
    /// A dependency or the filesystem failed; the service itself is fine.
    Dependency,
    /// Something the kit did not expect; a bug until proven otherwise.
    Internal,
}

/// An error with its remedy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error {
    pub kind: Kind,
    pub message: String,
    pub remedy: String,
}

impl Error {
    /// The only way to build one: kind, what happened, what to do now.
    pub fn new(kind: Kind, message: impl Into<String>, remedy: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            remedy: remedy.into(),
        }
    }

    pub fn config(message: impl Into<String>, remedy: impl Into<String>) -> Self {
        Self::new(Kind::Config, message, remedy)
    }

    pub fn invalid(message: impl Into<String>, remedy: impl Into<String>) -> Self {
        Self::new(Kind::Invalid, message, remedy)
    }

    pub fn dependency(message: impl Into<String>, remedy: impl Into<String>) -> Self {
        Self::new(Kind::Dependency, message, remedy)
    }

    pub fn internal(message: impl Into<String>, remedy: impl Into<String>) -> Self {
        Self::new(Kind::Internal, message, remedy)
    }
}

impl fmt::Display for Error {
    /// `message. What now: remedy` — the shape every log line and every
    /// terminal message uses, so a reader always finds the remedy at the
    /// same place.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}. What now: {}", self.message, self.remedy)
    }
}

impl std::error::Error for Error {}

/// What a project's own error type implements so the kit can render it
/// as an API response with the project's remedy (AR4).
pub trait IntoKitError {
    fn into_kit_error(self) -> Error;
}

impl IntoKitError for Error {
    fn into_kit_error(self) -> Error {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_puts_the_remedy_after_what_now() {
        let e = Error::config("port 80 is taken", "set INBOX_LISTEN to a free port");
        assert_eq!(
            e.to_string(),
            "port 80 is taken. What now: set INBOX_LISTEN to a free port"
        );
    }
}
