//! Unit tests for the `next` check.

use super::next::{destination, destination_of, login_url, safe_next};

#[test]
fn plain_paths_pass() {
    for ok in ["/", "/clients", "/a/b?x=1&y=2", "/p#frag", "/%2Fevil"] {
        assert_eq!(safe_next(ok), Some(ok), "{ok}");
    }
}

#[test]
fn everything_else_is_refused() {
    for bad in [
        "",
        "x",
        "//evil",
        "/\\evil",
        "https://evil",
        "javascript:x",
        "/a\nb",
        "/a\rb",
        "/a\tb",
        "/a b",
        "/login",
        "/LOGIN",
        "/login?x=1",
        "/logout",
        "/logout#x",
    ] {
        assert_eq!(safe_next(bad), None, "{bad:?}");
    }
    assert_eq!(safe_next(&format!("/{}", "a".repeat(3000))), None);
}

#[test]
fn destination_defaults_home() {
    assert_eq!(destination(None), "/");
    assert_eq!(destination(Some("//evil")), "/");
    assert_eq!(destination(Some("/x?y=1")), "/x?y=1");
}

#[test]
fn login_url_encodes_and_skips_home() {
    assert_eq!(login_url("/"), "/login");
    assert_eq!(login_url("/a b"), "/login");
    assert_eq!(
        login_url("/a?b=c&d=é"),
        "/login?next=%2Fa%3Fb%3Dc%26d%3D%C3%A9"
    );
}

#[test]
fn a_login_uri_lands_on_its_safe_next() {
    let to = |u: &str| destination_of(&u.parse().unwrap());
    assert_eq!(to("/login?next=%2Frecipes"), "/recipes");
    assert_eq!(to("/login?next=%2F%2Fevil"), "/");
    assert_eq!(to("/login"), "/");
}
