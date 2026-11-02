//! Source locks for Kenny's kit-page choices of round [kp11] (2026-11-02).

use crate::fixtures::kit_file;

/// [fix-kit-choice-1] The login page says only whether the service answers.
#[test]
fn the_login_page_script_and_template_carry_no_version() {
    let login = kit_file("templates/login.html");
    assert!(!login.contains("{{ version }}") && !login.contains("started_at"));
    let js = kit_file("static/chassis/login-page.js");
    assert!(!js.contains("body.version") && !js.contains("started"));
}

/// [fix-kit-choice-2] "Legende verhuizen": the legend of "Where the space
/// goes" is drawn in the "Give back empty space" card, and the budget card's
/// bar has none, so both cards stay equal height.
#[test]
fn the_storage_legend_lives_in_the_give_back_card() {
    let js = kit_file("static/chassis/storage-budget-html.js");
    assert!(
        js.contains("stackSpec = (t) => ({ ...stackBase(t), legend: false })")
            && js.contains(
                "legendSpec = (t) => ({ ...stackBase(t), title: 'Where the space goes' })"
            ),
        "the budget bar has no legend and the legend has its title"
    );
    let card = kit_file("static/chassis/storage-compact-card.js");
    assert!(
        card.contains("data-storage-legend"),
        "the compact card holds the legend"
    );
    let css = kit_file("static/chassis/storage.css");
    assert!(
        css.contains("grid-template-rows: auto auto auto 1fr;")
            && css.contains(".storage-legend :is(.kp-stackbar__bar"),
        "the button keeps the bottom edge and the legend shows without a second track"
    );
}

/// [fix-kit-choice-3] "Ruimte voor twee regels": the banner's minimum height
/// is the theme's 6.25rem plus two lines (7.75rem) on a wide screen.
#[test]
fn the_connection_banner_has_room_for_two_lines_of_detail() {
    let css = kit_file("static/chassis/shell.css");
    assert!(
        css.contains(".kp-connection { --kp-connection-min: 7.75rem; }"),
        "the banner keeps room for two lines of detail in every state"
    );
}
