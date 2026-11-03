//! [fix-touch-44-1..7] A touch screen: every control the kit owns is at least
//! 44 x 44 px under `(pointer: coarse)`. The measurement lives in
//! tests/browser/touch_targets.firefox.mjs (a release check on Firefox); this
//! lock keeps the rules it depends on in the stylesheet.

use crate::fixtures::kit_file;

/// The text of every `@media (pointer: coarse)` block of a stylesheet.
fn coarse_blocks(css: &str) -> String {
    let mut out = String::new();
    let mut rest = css;
    while let Some(at) = rest.find("@media (pointer: coarse)") {
        let tail = &rest[at..];
        let open = tail.find('{').expect("a media block opens");
        let (mut depth, mut end) = (0, open);
        for (i, c) in tail[open..].char_indices() {
            match c {
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        end = open + i;
                        break;
                    }
                }
                _ => {}
            }
        }
        out.push_str(&tail[..=end]);
        rest = &tail[end..];
    }
    out
}

#[test]
fn the_bars_controls_are_44_px_on_a_touch_screen() {
    let coarse = coarse_blocks(&kit_file("static/chassis/shell.css"));
    for selector in [".kp-skip-link", ".kp-nav__brand", ".kp-nav__search-trigger"] {
        assert!(
            coarse.contains(selector),
            "no coarse-pointer rule for {selector}"
        );
    }
    assert!(
        coarse.contains("--kp-touch-target"),
        "the rule uses kp-themes' touch target token"
    );
}

#[test]
fn refresh_now_is_44_px_on_a_touch_screen_and_shares_the_row_on_a_screen() {
    let css = kit_file("static/chassis/refresh.css");
    assert!(coarse_blocks(&css).contains(".kp-refresh__bar > .kp-button"));
    assert!(
        css.contains(":has(> .kp-refresh__caption)"),
        "four cells (caption, chooser, line, button) need four columns on a screen"
    );
}

#[test]
fn a_tab_label_is_never_broken_inside_a_word() {
    let css = kit_file("static/chassis/shell.css");
    assert!(css.contains("overflow-wrap: normal;") && css.contains("word-break: keep-all;"));
    assert!(!css.contains("overflow-wrap: break-word;\n}\n\n/* [fix-hsb-cycle-1]"));
}
