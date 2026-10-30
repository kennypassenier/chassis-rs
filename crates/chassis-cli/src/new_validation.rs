//! What `chassis new` accepts as a name, a repository and a description. Its
//! own module because these values are rendered into TOML, bash, a systemd
//! unit and a Rust doc comment, so the rules are a security boundary of their own.

use chassis::Error;

/// S8: `repo` and `description` are rendered into TOML, bash, a systemd
/// unit and a Rust doc comment with autoescape off, so they are checked
/// for the shapes those contexts can take, not trusted.
pub(crate) fn validate_repo(repo: &str) -> Result<(), Error> {
    let ok = repo.split_once('/').is_some_and(|(o, n)| {
        !o.is_empty()
            && !n.is_empty()
            && [o, n].iter().all(|p| {
                p.chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
            })
    });
    if ok {
        Ok(())
    } else {
        Err(Error::invalid(
            format!("`{repo}` is not a GitHub owner/name"),
            "use letters, digits, `_`, `.` and `-` on both sides of one slash, e.g. kennypassenier/inbox",
        ))
    }
}

pub(crate) fn validate_description(description: &str) -> Result<(), Error> {
    let ok = (1..=120).contains(&description.chars().count())
        && !description
            .chars()
            .any(|c| c.is_control() || matches!(c, '"' | '\\' | '`' | '$' | '{' | '}'));
    if ok {
        Ok(())
    } else {
        Err(Error::invalid(
            "the description must be one plain line",
            "1-120 characters, no newline, quote, backslash, backtick, `$` or braces (it lands in Cargo.toml, the unit and a doc comment)",
        ))
    }
}

pub(crate) fn validate_name(name: &str) -> Result<(), Error> {
    let ok = (1..=32).contains(&name.len())
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && name.chars().next().is_some_and(|c| c.is_ascii_lowercase());
    if ok {
        Ok(())
    } else {
        Err(Error::invalid(
            format!("`{name}` is not a valid service name"),
            "use 1-32 lowercase letters, digits and dashes, starting with a letter (it becomes the binary, unit and env prefix)",
        ))
    }
}
