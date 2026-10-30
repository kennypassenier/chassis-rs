//! Source-level locks on the script and style the Storage page ships.

use crate::fixtures::kit_file;

#[test]
fn the_script_and_the_style_keep_the_approved_parts() {
    let js = kit_file("static/chassis.js");
    let block = js
        .split("storage (kit-storage, 3.11.0)")
        .nth(1)
        .expect("the storage block");
    // Stable control ids for the homelab Live view.
    for id in [
        "storage-open-clean-",
        "storage-band-clean",
        "storage-open-compact",
        "storage-clean-dialog",
        "storage-clean-older",
        "storage-clean-filter-",
        "storage-clean-reset",
        "storage-clean-preview",
        "storage-clean-continue",
        "storage-clean-confirm",
        "storage-clean-back",
        "storage-clean-delete",
        "storage-clean-close",
        "storage-clean-done",
        "storage-compact-dialog",
        "storage-compact-run",
        "storage-compact-cancel",
        "storage-compact-done",
    ] {
        assert!(block.contains(id), "the stable control id {id} is gone");
    }
    // The approved words and parts.
    for part in [
        "Delete for good",
        "Continue to confirm",
        "Compact now",
        "Nothing matches",
        "The preview could not be made",
        "Compacting did not finish",
        "The storage could not be read",
        "Where the space goes",
        "Cleans itself",
        "data-kp-type-confirm=",
        "data-kp-segmented=",
        "data-kp-datepicker",
        "kp-steplist--journey",
        "setStackbar",
        "setCardState",
        "runFlashButton",
    ] {
        assert!(block.contains(part), "the approved part {part} is gone");
    }
    // What is typed is the kind's name as the page shows it, and the server
    // checks the same words (no id is sent as the confirmation).
    assert!(block.contains("p.confirm_with"));
    assert!(!block.contains("confirm: c.kind") && !block.contains("confirm: k.id"));
    // Every state of a card is the package's own, never a hand-made note.
    for hand_made in ["Loading…", "No data", "kp-spinner"] {
        assert!(
            !block.contains(hand_made),
            "a hand-made state ({hand_made}) stands in for the package's"
        );
    }
    // Sizes are human and decimal, dates dd/mm/yyyy HH:mm, counts exact.
    assert!(block.contains("1e6") && block.contains("formatBrussels"));
    assert!(!block.contains("99+") && !block.contains("toLocaleString"));
    // The chord the first letter cannot give (Status has "s").
    assert!(js.contains("chassisChord"));

    let css = kit_file("static/chassis.css");
    let part = css
        .split("storage (kit-storage, 3.11.0")
        .nth(1)
        .expect("the storage style");
    for rule in [
        ".storage-budget",
        ".storage-files",
        ".storage-kind",
        ".storage-share",
        ".storage-clean__grid",
        ".storage-compact__grid",
        "grid-template-areas",
        "@container storaged",
        "@container storagec",
    ] {
        assert!(part.contains(rule), "the layout rule {rule} is gone");
    }
    // Only tokens: no colour literal in the page's rules.
    let rules = part
        .split("Until the next kp-themes release")
        .next()
        .unwrap();
    assert!(
        !rules.contains('#') && !rules.contains("rgb(") && !rules.contains("hsl("),
        "the Storage page's style uses tokens only"
    );
    // The kp-themes workarounds stand in ONE block that says when to delete them.
    assert_eq!(
        css.matches("Until the next kp-themes release").count(),
        1,
        "the workarounds are one marked block"
    );
}

#[test]
fn budget_editor_keeps_its_ids_its_kit_parts_and_the_one_post() {
    let js = kit_file("static/chassis.js");
    let block = js
        .split("storage (kit-storage, 3.11.0)")
        .nth(1)
        .expect("the storage block");
    // Stable control ids for the homelab Live view.
    for id in [
        "storage-budget-mb",
        "storage-warn-mb",
        "storage-budget-save",
        "storage-budget-reset",
    ] {
        assert!(block.contains(id), "the stable control id {id} is gone");
    }
    // Only kit parts: the quantity field, the form grid, the flash button and a toast.
    for part in [
        "data-kp-quantity",
        "kp-formgrid__row",
        "data-kp-formgrid-stack",
        "data-kp-flash-button",
        "overlays.toast",
        "/api/kit/storage/budget",
        "Only a warning: nothing is deleted when the budget is reached",
        "Reset to default",
        "data-kp-quantity-disabled",
    ] {
        assert!(block.contains(part), "the budget editor lost {part}");
    }
    // Fixed by configuration: disabled with the reason, never hidden.
    assert!(
        block.contains("fixedBy") && block.contains("budget_fixed") && block.contains("warn_fixed")
    );
    // The editor shares the card's grid, across both of its columns.
    let css = kit_file("static/chassis.css");
    assert!(css.contains(".storage-budget__edit { grid-column: 1 / -1; }"));
}

/// Measured 2026-10-21 at 390 px: a long preference key was cut without an
/// ellipsis in the sample cards. As cards, a cell wraps instead.
#[test]
fn sample_cards_wrap_long_values() {
    let css = kit_file("static/chassis.css");
    assert!(css.contains(
        ".storage-prev__table[data-kp-cards] td { max-inline-size: none; white-space: normal; overflow-wrap: anywhere; }"
    ));
}

/// Kenny, 2026-10-24 (confirmed in the 3.14.0 form): the Storage page
/// refreshes every five minutes by default, and "Every 5 min" is offered.
#[test]
fn storage_defaults_to_five_minutes() {
    let page = kit_file("templates/storage.html");
    assert!(page.contains(r#"data-kp-refresh="300""#));
    assert!(page.contains(r#"data-kp-refresh-choices="0,15,30,60,300""#));
}

/// Kenny, 2026-10-30 (almanac, kyu): "updated 0 s ago" never counted on.
/// The refresh control's line ticks only when the freshness ticker runs, so
/// the Storage page and the Clients page ask for it wherever a refresh
/// control is.
#[test]
fn the_refresh_line_ticks_on_storage_and_clients() {
    let js = kit_file("static/chassis.js");
    assert!(
        js.contains("['freshness', '[data-kp-refresh], [data-kp-ago]', (m, r) => m.attachAgo(r)],")
    );
    assert!(js.contains("['[data-kp-refresh], [data-kp-ago]', 'freshness', 'attachAgo'],"));
}
