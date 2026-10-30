//! The client token the primary notification target asks for (3.15.0,
//! `docs/NOTIFY_DESIGN.md`), as a pure value with its rules.
//!
//! kyu puts its publish route behind `Authorization: Bearer <client token>`.
//! The token is a secret: it comes from the environment (`<P>_NOTIFY_TOKEN`,
//! put there by latch like every key), never from the config file, and this
//! type is the one place that holds it. It has no `Display`, and its `Debug`
//! prints `***`, so a stray `{:?}` or `tracing` field cannot leak it.
//!
//! What a valid token looks like: kyu issues 64 hex characters (32 random
//! bytes), the login token from `gen-secret` is of the same size. The rule
//! is wider than that on purpose, so a token from another hub works: 16 to
//! 512 characters, all visible ASCII (no space, no control character), the
//! characters an `Authorization` header can carry unchanged. Anything else
//! is a typo or a truncated paste and refuses the start.

use crate::core::error::Error;

/// Shortest accepted token, in characters.
pub(crate) const MIN_LEN: usize = 16;
/// Longest accepted token, in characters.
pub(crate) const MAX_LEN: usize = 512;

/// A validated bearer token. Cloning is cheap enough (a short string).
#[derive(Clone, PartialEq, Eq)]
pub(crate) struct NotifyToken(String);

impl std::fmt::Debug for NotifyToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("NotifyToken(***)")
    }
}

impl NotifyToken {
    /// Check `raw` (an empty text counts as "not set" and gives `None`, since
    /// an `EnvironmentFile` line `X=` is how a token is switched off).
    /// The error names the variable and the rule, never the value.
    pub(crate) fn parse(raw: &str, env_name: &str) -> Result<Option<Self>, Error> {
        if raw.is_empty() {
            return Ok(None);
        }
        let len = raw.chars().count();
        let bad = |why: &str| {
            Error::config(
                format!("{env_name} is not a usable token: {why}"),
                format!(
                    "set it to the client token the hub issued ({MIN_LEN} to {MAX_LEN} visible characters, no spaces or line breaks), or remove the variable"
                ),
            )
        };
        if len < MIN_LEN {
            return Err(bad(&format!("it is shorter than {MIN_LEN} characters")));
        }
        if len > MAX_LEN {
            return Err(bad(&format!("it is longer than {MAX_LEN} characters")));
        }
        if !raw.chars().all(|c| c.is_ascii_graphic()) {
            return Err(bad(
                "it contains a space, a line break, a control character or a non-ASCII character",
            ));
        }
        Ok(Some(Self(raw.to_string())))
    }

    /// The `Authorization` header value. The only place the secret leaves.
    pub(crate) fn bearer(&self) -> String {
        format!("Bearer {}", self.0)
    }
}

/// The sentence for a 401 or 403 from the primary, naming the token as the
/// likely cause and the variable to fix. Never contains the token.
pub(crate) fn refusal_sentence(status: u16, token_set: bool, env_name: &str) -> String {
    if token_set {
        format!(
            "it answered HTTP {status}: the hub refused the token, which is probably wrong or revoked (check {env_name})"
        )
    } else {
        format!("it answered HTTP {status}: the hub wants a token and none is set (set {env_name})")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEX64: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn a_kyu_token_and_an_empty_value_are_accepted() {
        assert!(
            NotifyToken::parse(HEX64, "X_NOTIFY_TOKEN")
                .unwrap()
                .is_some()
        );
        assert!(NotifyToken::parse("", "X_NOTIFY_TOKEN").unwrap().is_none());
    }

    #[test]
    fn short_long_and_unclean_tokens_refuse_without_echoing_the_value() {
        for bad in [
            "short-secret",
            "has a space inside 0123456789",
            "line\nbreak0123456789abcdef",
            "tab\tinside0123456789abcdef",
            "ünïcode-0123456789abcdef",
            &"a".repeat(MAX_LEN + 1),
        ] {
            let e = NotifyToken::parse(bad, "X_NOTIFY_TOKEN").unwrap_err();
            let text = format!("{} {}", e.message, e.remedy);
            assert!(text.contains("X_NOTIFY_TOKEN"), "{text}");
            assert!(!text.contains(bad), "echoed the value: {text}");
        }
    }

    #[test]
    fn debug_never_shows_the_token_and_the_header_carries_it() {
        let t = NotifyToken::parse(HEX64, "X").unwrap().unwrap();
        assert!(!format!("{t:?}").contains("0123"));
        assert_eq!(t.bearer(), format!("Bearer {HEX64}"));
    }

    #[test]
    fn the_refusal_sentence_names_the_variable_not_the_token() {
        let s = refusal_sentence(401, false, "X_NOTIFY_TOKEN");
        assert!(s.contains("none is set") && s.contains("X_NOTIFY_TOKEN"));
        assert!(refusal_sentence(403, true, "X_NOTIFY_TOKEN").contains("wrong or revoked"));
    }
}
