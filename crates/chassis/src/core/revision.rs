//! Revisions and `If-Match` (feat-offline-1): the pure half of the optimistic
//! concurrency check an app puts on its data routes.
//!
//! A revision is a `u64` the app keeps per item (absent = 0) and raises on
//! every replace. A request names the one it read in `If-Match` (`5`, `"5"`,
//! `W/"5"` or `*`); a different stored revision means the item was saved
//! since, and the write is refused instead of silently overwriting it.

use crate::core::error::Error;

/// What an `If-Match` header asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum Precondition {
    /// `*`: any existing version will do.
    Any,
    /// The item must still be at this revision.
    Rev(u64),
}

/// The stored revision differs from the one the request read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub struct Stale {
    /// The revision stored now.
    pub current: u64,
}

impl Precondition {
    /// Parse an `If-Match` value. A list (`"1", "2"`) is refused: a data
    /// route has exactly one current revision to compare with.
    pub fn parse(value: &str) -> Result<Self, Error> {
        let text = value.trim();
        if text == "*" {
            return Ok(Self::Any);
        }
        let bare = text.strip_prefix("W/").unwrap_or(text);
        let bare = bare
            .strip_prefix('"')
            .and_then(|t| t.strip_suffix('"'))
            .unwrap_or(bare);
        bare.parse().map(Self::Rev).map_err(|_| {
            Error::invalid(
                format!("If-Match {text:?} is not a revision"),
                "send the revision the item had when it was read, as the ETag said, or leave the header out",
            )
        })
    }

    /// Whether a write may go ahead on an item stored at `current`.
    pub fn check(self, current: u64) -> Result<(), Stale> {
        match self {
            Self::Any => Ok(()),
            Self::Rev(want) if want == current => Ok(()),
            Self::Rev(_) => Err(Stale { current }),
        }
    }
}

/// The check for a request that may carry no `If-Match`: absent means no check.
pub fn check(want: Option<Precondition>, current: u64) -> Result<(), Stale> {
    want.map_or(Ok(()), |p| p.check(current))
}

/// The `ETag` value of a revision (a quoted strong tag).
pub fn etag(rev: u64) -> String {
    format!("\"{rev}\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_accepted_spellings() {
        for text in ["5", "\"5\"", "W/\"5\"", " 5 "] {
            assert_eq!(
                Precondition::parse(text).unwrap(),
                Precondition::Rev(5),
                "{text}"
            );
        }
        assert_eq!(Precondition::parse("*").unwrap(), Precondition::Any);
    }

    #[test]
    fn anything_else_is_refused_with_a_remedy() {
        for text in ["", "abc", "\"1\", \"2\"", "-1", "5.0"] {
            let e = Precondition::parse(text).unwrap_err();
            assert!(!e.remedy.is_empty(), "{text}");
        }
    }

    #[test]
    fn a_matching_revision_passes_a_different_one_is_stale() {
        assert!(Precondition::Rev(3).check(3).is_ok());
        assert_eq!(Precondition::Rev(3).check(4), Err(Stale { current: 4 }));
        assert!(Precondition::Any.check(9).is_ok());
        assert!(check(None, 9).is_ok(), "no header, no check");
        assert_eq!(
            check(Some(Precondition::Rev(0)), 1),
            Err(Stale { current: 1 })
        );
    }

    #[test]
    fn the_etag_is_quoted() {
        assert_eq!(etag(7), "\"7\"");
    }
}
