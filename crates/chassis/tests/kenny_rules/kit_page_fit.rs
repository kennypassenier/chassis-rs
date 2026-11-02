//! Rules about how the kit's pages and dialogs fit: the page container, and
//! dialogs that are as large as their content and no larger
//! (the kit-page UX review, 2026-11-01).

use crate::fixtures::kit_file;

/// Kenny, 2026-10-25: page elements fill the 80 % container, never narrower.
/// `<main class="kp-page">` is the container (max(80vw, 64rem), padded); the
/// `.kp-ops` column inside it capped and padded a second time, so the kit's
/// pages used 976 of 1280 px. Every kit page carries `.chassis-ops`, which
/// hands the width and the inline padding back to the container.
#[test]
fn every_kit_page_fills_the_page_container() {
    let css = kit_file("static/chassis.css");
    assert!(
        css.contains(".chassis-ops {")
            && css.contains("--kp-ops-width: none;")
            && css.contains("--kp-ops-pad-inline: 0px;"),
        "the kit's page column must take the container's whole width"
    );
    for page in ["status", "clients", "storage", "passkeys", "error"] {
        let html = kit_file(&format!("templates/{page}.html"));
        let root = html
            .lines()
            .find(|l| l.contains(r#"<div class="kp-ops"#) || l.contains(r#"<div class="kp-ops "#))
            .unwrap_or_else(|| panic!("{page}.html has no .kp-ops root"));
        assert!(
            root.contains("kp-ops chassis-ops"),
            "{page}.html: the page root must carry .chassis-ops: {root}"
        );
    }
}

/// The Issue dialog is as large as its content: one name field is a short
/// dialog. No row of its grid, no title and no card has a minimum height
/// (it was 750 px at 1280 and 882 px at 390).
#[test]
fn the_issue_dialog_is_sized_to_its_content() {
    let css = kit_file("static/chassis/clients-issue.css");
    for knob in ["--issue-head", "--issue-main", "--issue-foot"] {
        assert!(!css.contains(knob), "{knob}: a fixed row height is back");
    }
    assert!(
        css.contains("grid-template-rows: auto auto 1fr auto;"),
        "the issue grid's rows follow their content"
    );
    assert!(
        !css.contains("min-block-size"),
        "a minimum height in the issue dialog would stretch it again"
    );
}

/// The name field's example is a hint under the field, not a placeholder (a
/// placeholder reads as a value already typed), and the preview line is a
/// sentence that explains where the requests go.
#[test]
fn the_issue_example_is_a_hint_and_the_destination_is_a_sentence() {
    let html = kit_file("templates/clients.html");
    assert!(
        !html.contains(r#"placeholder="home-assistant""#),
        "the example must not sit in the placeholder"
    );
    assert!(
        html.contains(r#"<p class="kp-field__help">For example home-assistant."#),
        "the example belongs in the hint line under the field"
    );
    assert!(
        html.contains("Requests from this {{ vocab.singular }} will go to"),
        "the destination reads as an explanation in the page's vocabulary"
    );
    assert!(
        !html.contains("<dt>Calls</dt>"),
        "the bare 'Calls POST /t/…' line is gone"
    );
}

/// The Clean up dialog is as large as its content: the preview's stage and
/// the confirm band have no minimum height, so a kind with nothing to remove
/// is a short dialog (it was 854 px, mostly empty).
#[test]
fn the_clean_up_dialog_is_sized_to_its_content() {
    let css = kit_file("static/chassis/storage.css");
    let clean = css
        .split(".storage-clean {")
        .nth(1)
        .and_then(|rest| rest.split("--- the compact dialog").next())
        .expect("the clean-up dialog's rules");
    assert!(
        !clean.contains("--kp-card-stage-min") && !clean.contains("min-block-size: 9rem"),
        "a minimum height on the preview or the confirm band is back: {clean}"
    );
}

/// [fix-hsb-ux-1..6] Faults found in the HTTPSwitchboard pass; each rule
/// fails if its fix is undone.
#[test]
fn the_connection_banner_and_the_tab_labels_keep_their_geometry() {
    let css = kit_file("static/chassis/shell.css");
    for rule in [
        ".kp-connection__band { align-items: start; }",
        ".kp-connection__body { align-self: stretch; align-content: start; }",
        "min-inline-size: 7.5rem;",
        ".chassis-tabbar .kp-tabbar__tab { align-content: start; }",
        "-webkit-line-clamp: 2;",
    ] {
        assert!(css.contains(rule), "shell.css lost: {rule}");
    }
}

#[test]
fn the_storage_page_uses_plain_words_and_lets_its_rows_stand_at_their_own_height() {
    let css = kit_file("static/chassis/storage.css");
    assert!(
        css.contains(".storage-compact-card .kp-kv { align-content: start; }"),
        "the compact card's facts must not stretch to the card"
    );
    assert!(
        !css.contains("max-inline-size: 18rem"),
        "a cap on the kind's column squeezes its description"
    );
    let mut all = String::new();
    for part in [
        "storage-budget-html.js",
        "storage-compact-card.js",
        "storage-compact-html.js",
        "storage-clean-html.js",
        "storage-dialog.js",
        "storage-kinds.js",
        "storage-format.js",
        "storage-budget-editor.js",
    ] {
        all.push_str(&kit_file(&format!("static/chassis/{part}")));
    }
    for word in [
        "SQLite",
        "write log",
        "(${pct",
        "deleted rows",
        "Counting the rows",
        "every row",
    ] {
        assert!(!all.contains(word), "internal wording is back: {word}");
    }
}

#[test]
fn the_empty_clients_page_says_it_once_and_the_login_tells_nothing_about_health() {
    let html = kit_file("templates/clients.html");
    assert!(
        !html.contains("kp-stateplate"),
        "the 'none yet' plate repeats what the steps already say"
    );
    let login = kit_file("templates/login.html");
    assert!(
        !login.contains("· version") && !login.contains("· up"),
        "a separator character can start a line when the row wraps"
    );
    let js = kit_file("static/chassis/login-page.js");
    assert!(
        !js.contains("is degraded") && !js.contains("is healthy"),
        "an anonymous visitor does not learn what is failing"
    );
}
