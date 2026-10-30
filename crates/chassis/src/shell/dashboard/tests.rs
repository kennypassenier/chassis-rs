//! Tests of the dashboard's own logic: vocabulary, error wording, asset
//! merging and the theme registry. The markup and script lints are in `assets`.

mod assets;
mod templates;

use super::*;
use clients::{calls_path, usual_values};

/// kit-r4 (Kenny 2026-10-21): the token variable follows the vocabulary.
#[test]
fn token_var_is_derived_from_the_singular_word() {
    for (word, var) in [
        ("client", "CLIENT_TOKEN"),
        ("source", "SOURCE_TOKEN"),
        ("app", "APP_TOKEN"),
        ("hub client", "HUB_CLIENT_TOKEN"),
        ("hub--client ", "HUB_CLIENT_TOKEN"),
        ("3rd", "KIT_3RD_TOKEN"),
        ("", "CLIENT_TOKEN"),
    ] {
        assert_eq!(Vocabulary::new(word, "x").token_var(), var, "{word:?}");
    }
    assert_eq!(Vocabulary::default().token_var(), "CLIENT_TOKEN");
}

/// kit-r4 (kyu gap 53): "an app", "a source", "an inbox", by sound.
#[test]
fn article_follows_the_vowel_sound() {
    for (word, article) in [
        ("app", "an"),
        ("inbox", "an"),
        ("source", "a"),
        ("client", "a"),
        ("user", "a"),
        ("unit", "a"),
        ("umbrella", "an"),
        ("one", "a"),
        ("hour", "an"),
        ("Endpoint", "an"),
        ("", "a"),
    ] {
        assert_eq!(article_for(word), article, "{word}");
    }
}

/// kit-kp11: an error page's sentences open with a capital and close with
/// a stop, the drawing and the plain reason follow the status.
#[test]
fn error_pages_read_as_sentences_with_a_drawing_per_kind() {
    assert_eq!(sentence("log in again"), "Log in again.");
    assert_eq!(sentence("Try later!"), "Try later!");
    assert_eq!(sentence(""), "");
    assert_eq!(capitalised(" no client with id x"), "No client with id x");
    for (code, art) in [
        (401, "locked"),
        (403, "locked"),
        (404, "nomatch"),
        (500, "error"),
        (503, "offline"),
    ] {
        let (found, why) = error_look(StatusCode::from_u16(code).unwrap());
        assert_eq!(found, art, "{code}");
        assert!(why.ends_with('.'), "{code}: {why}");
    }
}

/// kit-kp11: the shell's palette and shortcuts find the clients page's
/// actions through these hooks, and the figures stay exact filters.
#[test]
fn the_calls_path_is_the_end_of_the_command_template() {
    assert_eq!(
        calls_path("curl -sS -H \"A: B $CLIENT_TOKEN\" -d '{}' http://127.0.0.1:9/v1/messages"),
        "/v1/messages"
    );
    assert_eq!(calls_path(""), "/");
    assert_eq!(
        usual_values(["b", "—", "", "a", "b"].into_iter()),
        vec!["b".to_string(), "a".to_string()]
    );
}

#[test]
fn section_assets_merge_once_in_order_and_refuse_foreign_paths() {
    let a = SectionAssets::new()
        .module_script("/app/a.js")
        .stylesheet("/app/a.css");
    let b = SectionAssets::new()
        .module_script("/app/b.js")
        .module_script("/app/a.js")
        .module_script("https://evil.example/x.js")
        .module_script("//evil.example/x.js")
        .module_script("/a\"onload=\"x")
        .module_script("/../etc/passwd")
        .stylesheet("/app/a.css");
    let m = merge_section_assets(&[a, b]);
    assert_eq!(m.module_scripts, ["/app/a.js", "/app/b.js"]);
    assert_eq!(m.stylesheets, ["/app/a.css"]);
}

#[test]
fn theme_list_comes_from_the_vendored_registry() {
    let t = themes();
    assert_eq!(
        t.len(),
        12,
        "kp-themes 11.3.0 ships exactly 12 themes (10.0.0 removed lapis, shade-light and shade-dark; 10.1.0 removed high-contrast, sepia and retro; 11.0.0 removed terminal, phantom, light and grotesk); the vendored registry is pinned"
    );
    assert_eq!(t[0].name, "formal");
    assert_eq!(t[0].label, "Formal");
    assert!(!t[0].dark);
    for gone in [
        "high-contrast",
        "sepia",
        "retro",
        "terminal",
        "phantom",
        "light",
        "grotesk",
    ] {
        assert!(
            t.iter().all(|x| x.name != gone),
            "{gone} left kp-themes (10.1.0 or 11.0.0)"
        );
    }
    assert!(t.iter().any(|x| x.name == "cyberpunk" && x.dark));
}

/// A stored old name is mapped to a theme the vendored registry still
/// has: kp-themes 6.0.0 removed `woodblock`, which the 5.0.0 mapping
/// used as the target for `nishiki`.
#[test]
fn every_renamed_theme_maps_to_a_theme_that_exists() {
    let boot = include_str!("../../../static/theme-boot.js");
    let line = boot
        .lines()
        .find(|l| l.contains("var renamed = {"))
        .expect("the mapping line");
    let body = line
        .split('{')
        .nth(1)
        .and_then(|r| r.split('}').next())
        .unwrap();
    let names: Vec<&str> = themes().iter().map(|t| t.name.as_str()).collect();
    let mut pairs = 0;
    for pair in body.split(',') {
        let (from, to) = pair.split_once(':').expect("from: to");
        let to = to.trim().trim_matches('"');
        let from = from.trim().trim_matches('"');
        assert!(
            names.contains(&to),
            "{from} maps to {to}, which kp-themes no longer has"
        );
        assert!(
            !names.contains(&from),
            "{from} still exists; mapping it would override a choice"
        );
        pairs += 1;
    }
    assert!(
        pairs >= 7,
        "renamed and removed themes are all mapped ({pairs})"
    );
}
