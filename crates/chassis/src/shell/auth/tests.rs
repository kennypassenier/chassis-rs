//! Unit tests for `auth`; kept in their own file so the module stays small.

use super::*;

#[test]
fn secrets_need_both_or_neither_and_point_at_gen_secret() {
    assert!(Secrets::parse("X", None, None).unwrap().is_none());
    let err = Secrets::parse("X", Some("a-long-enough-login-token"), None).unwrap_err();
    assert!(
        err.message
            .contains("X_TOKEN is set but X_SECRET_KEY is not")
    );
    assert!(err.remedy.contains("gen-secret"));
    let err = Secrets::parse("X", Some("short"), Some(&"ab".repeat(32))).unwrap_err();
    assert!(err.message.contains("16 characters"));
    let ok = Secrets::parse(
        "X",
        Some("a-long-enough-login-token"),
        Some(&"ab".repeat(32)),
    )
    .unwrap();
    assert!(ok.is_some());
    // A generated value never appears in the error text (critic #12).
    let err = Secrets::parse("X", Some("a-long-enough-login-token"), Some("zz")).unwrap_err();
    assert!(
        err.remedy.contains("e.g. "),
        "the remedy carries a pasteable candidate for a MALFORMED key"
    );
}
