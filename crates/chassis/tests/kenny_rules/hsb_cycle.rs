//! Source locks for the HTTPSwitchboard release-cycle round (2026-11-03).

use crate::fixtures::kit_file;

/// [fix-hsb-cycle-1] A word wider than its tab ("TRANSLATION" in a five-tab
/// phone bar) was cut to "TRANSLATI..." even though labels wrap. The shell
/// attaches the fit, and the stylesheet has a size for every level the fit can
/// set, so a level can never be set without a rule behind it.
#[test]
fn a_tab_label_steps_down_in_size_instead_of_being_cut() {
    let shell = kit_file("static/chassis/shell.js");
    assert!(
        shell.contains("attachTabbarFit(joined)"),
        "shell.js must attach the tab label fit"
    );
    let fit = kit_file("static/chassis/shell-tabbar-fit.js");
    let css = kit_file("static/chassis/shell.css");
    for level in ["small", "smaller", "tiny", "tiniest"] {
        assert!(
            fit.contains(&format!("'{level}'")),
            "the fit does not know the level {level}"
        );
        assert!(
            css.contains(&format!(".kp-tabbar__label[data-fit=\"{level}\"]")),
            "no rule for the fit level {level}"
        );
    }
}

/// [fix-hsb-cycle-2] An action on a client's page updates the page in place;
/// moving the focus to the heading after it scrolled the page to the top, which
/// lost the reader's place. The focus call must not scroll.
#[test]
fn an_in_place_update_never_scrolls_the_page_to_the_top() {
    let js = kit_file("static/chassis/client-swap.js");
    let focus = js
        .lines()
        .find(|l| l.contains(".focus("))
        .expect("client-swap.js moves the focus after a swap");
    assert!(
        focus.contains("preventScroll: true"),
        "the focus after a swap must not scroll: {focus}"
    );
}
