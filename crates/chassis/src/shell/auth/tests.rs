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

mod script_call {
    use super::super::navigation::is_script_call;
    use axum::http::HeaderMap;

    fn h(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
        pairs
            .iter()
            .map(|(k, v)| (k.parse().unwrap(), v.parse().unwrap()))
            .collect()
    }

    #[test]
    fn fetch_metadata_decides_and_a_navigation_keeps_the_redirect() {
        assert!(is_script_call(&h(&[
            ("sec-fetch-mode", "cors"),
            ("sec-fetch-dest", "empty")
        ])));
        assert!(is_script_call(&h(&[("sec-fetch-dest", "empty")])));
        assert!(!is_script_call(&h(&[
            ("sec-fetch-mode", "navigate"),
            ("sec-fetch-dest", "document")
        ])));
        assert!(is_script_call(&h(&[("accept", "application/json")])));
        assert!(!is_script_call(&h(&[(
            "accept",
            "text/html,application/xhtml+xml,*/*;q=0.8"
        )])));
        assert!(
            !is_script_call(&h(&[("accept", "*/*")])),
            "plain clients keep the 303"
        );
        assert!(!is_script_call(&h(&[])));
    }
}
