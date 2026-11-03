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

/// kp-themes split delivery: the head links the base stylesheet, THEN the
/// no-flash script (it writes the register below the base, so the cascade
/// layers are stated by the base), then the module entry. The script stays an
/// external file configured through its tag, and every theme the registry
/// lists has the register file the pattern names.
#[test]
fn the_head_carries_the_base_then_the_boot_script_then_the_entry() {
    use crate::shell::assets::{ASSETS, REGISTER_PATTERN};
    let layout = include_str!("../../../../templates/layout.html");
    let at = |needle: &str| {
        layout
            .find(needle)
            .unwrap_or_else(|| panic!("layout lacks {needle}"))
    };
    assert!(at("{{ base_stylesheet|safe }}") < at("/static/theme-boot.js"));
    assert!(at("/static/theme-boot.js") < at("/static/chassis.css"));
    assert!(at("{{ kp_entry|safe }}") < at("/static/chassis.js"));
    for attr in ["data-register-pattern=", "data-themes=", "data-fallback="] {
        let tag_start = at("/static/theme-boot.js");
        assert!(
            layout[tag_start..].find(attr).is_some_and(|i| i < 250),
            "{attr}"
        );
    }
    assert!(!layout.contains("kp-themes.css") && !layout.contains("fonts.css"));
    assert!(REGISTER_PATTERN.contains("{theme}"));
    for theme in crate::shell::dashboard::themes() {
        let file = REGISTER_PATTERN
            .replace("{theme}", &theme.name)
            .replace("/static/", "");
        assert!(
            ASSETS.iter().any(|(n, _, _)| *n == file),
            "{} has no register {file}",
            theme.name
        );
    }
}

/// theme-boot.js spells the register attribute as a literal; it is
/// kp-themes' `REGISTER_ATTRIBUTE`, and `attachLazyRegisters` finds the link
/// the boot script wrote by it.
#[test]
fn the_boot_script_writes_the_register_attribute_lazy_register_adopts() {
    let boot = include_str!("../../../../static/theme-boot.js");
    let values = include_str!("../../../../static/kp/js/lazy-register/values.js");
    let attribute = values
        .lines()
        .find(|l| l.contains("REGISTER_ATTRIBUTE ="))
        .and_then(|l| l.split('\'').nth(1))
        .expect("REGISTER_ATTRIBUTE in the vendored values.js");
    assert!(boot.contains(&format!("{attribute}=")), "{attribute}");
    assert!(
        boot.contains("blocking=\"render\""),
        "the link blocks the first paint"
    );
    assert!(
        boot.contains("document.currentScript"),
        "configured by its own tag"
    );
}
