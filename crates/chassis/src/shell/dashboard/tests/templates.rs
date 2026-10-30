//! Lints over the page templates: the explain blocks, the client name
//! pattern and the no-flash snippet. Split from `assets` to keep each file
//! to one scenario group.

// K16: every kit page opens with an explain block.
#[test]
fn every_page_template_has_an_explain_block() {
    for (name, src) in [
        (
            "login.html",
            include_str!("../../../../templates/login.html"),
        ),
        (
            "status.html",
            include_str!("../../../../templates/status.html"),
        ),
        (
            "clients.html",
            include_str!("../../../../templates/clients.html"),
        ),
        (
            "error.html",
            include_str!("../../../../templates/error.html"),
        ),
        (
            "passkeys.html",
            include_str!("../../../../templates/passkeys.html"),
        ),
        (
            "storage.html",
            include_str!("../../../../templates/storage.html"),
        ),
    ] {
        // kp-themes 11 pages say what they do in a `.kp-lede` (kit-kp11).
        assert!(
            src.contains("class=\"explain\"")
            // The status page opens on kp-themes' own page header and
            // ledes (kit-kp11), which say the same thing in the
            // package's words.
            || src.contains("kp-page-header__description")
            || src.contains("kp-lede"),
            "{name} lacks an explain block"
        );
    }
}

// The no-flash snippet (now `static/theme-boot.js`, S8: no inline
// script) must match the vendored module's behaviour: same storage
// key, same attribute — and the layout must load it as a plain script.
/// Live-found in the kp-themes 5.0.0 drill (2026-09-09): Chromium compiles
/// a `pattern` attribute with the `v` flag, where a bare `-` inside a
/// character class is a syntax error; the browser then logged
/// "Invalid character in character class" and ignored the pattern, so
/// the name field accepted anything and only the server refused. The
/// class escapes the hyphen. Red before the fix (the template carried
/// `._-]`), green after.
#[test]
fn client_name_pattern_is_valid_under_the_v_flag() {
    let clients = include_str!("../../../../templates/clients.html");
    assert!(
        clients.contains(r#"pattern="[A-Za-z0-9._\-]{1,64}""#),
        "the name pattern escapes the hyphen for the v flag"
    );
    assert!(
        !clients.contains("._-]"),
        "a bare hyphen at the end of the class is invalid under the v flag"
    );
}

#[test]
fn no_flash_snippet_matches_the_vendored_contract() {
    let layout = include_str!("../../../../templates/layout.html");
    let boot = include_str!("../../../../static/theme-boot.js");
    let registry = include_str!("../../../../static/kp/js/theme-registry.js");
    assert!(boot.contains("localStorage.getItem(\"theme\")"));
    assert!(registry.contains("STORAGE_KEY = 'theme'"));
    assert!(boot.contains("setAttribute(\"data-theme\""));
    assert!(
        layout.contains("/static/theme-boot.js?v="),
        "the layout loads the snippet as a file"
    );
    assert!(
        !layout.contains("<script>\n"),
        "no inline script in the layout (CSP script-src 'self')"
    );
    assert!(!layout.contains("bunny.net"), "fonts are vendored (S8)");
}
