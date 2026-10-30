//! Rules that pages use the components' own states and fill their rows.

use crate::fixtures::kit_file;

/// Kenny, 2026-10-19: "elk thema heeft al een loading animatie voor dit soort
/// element, gebruik het!" The status page uses each kp-themes component's own
/// loading, empty and failed states and its standard parts; no stand-in
/// spinner, "Loading…" line or hand-drawn skeleton.
#[test]
fn the_status_page_uses_the_components_own_states() {
    let html = kit_file("templates/status.html");
    let js = kit_file("static/chassis.js");
    let status = js
        .split("status (kit-kp11)")
        .nth(1)
        .expect("the status block");

    // Every data card is a card in four states, with the plate for empty.
    for part in [
        r#"data-chassis-card="health""#,
        r#"data-chassis-card="updates""#,
        r#"data-chassis-card="service""#,
        "kp-card__stage",
        "data-kp-card-built",
        "data-chassis-empty-title",
    ] {
        assert!(html.contains(part), "status.html lacks {part}");
    }
    // A data table carries its standard parts: search, empty slot with its
    // two reasons, the status line and the pager.
    for part in [
        "data-kp-datatable-search",
        "data-kp-datatable-empty-none",
        "data-kp-datatable-empty-nomatch",
        "data-kp-datatable-status",
        "data-kp-datatable-pager",
    ] {
        assert!(html.contains(part), "the status table lacks {part}");
        assert!(
            status.contains(part),
            "the redrawn status table lacks {part}"
        );
    }
    // An absent value is the key-value list's own mark.
    assert!(html.contains("kp-kv__none") && status.contains("kp-kv__none"));
    // The package's own loading and failed parts, through their APIs.
    for api in [
        "setCardState(card, 'loading'",
        "setCardState(card, 'error'",
        "setAttention(plate",
        "state: 'loading'",
        "setMeter(meter, { loading: true",
        "kp-skeleton",
        "handle.refresh()",
    ] {
        assert!(status.contains(api), "the status block lacks {api}");
    }
    // No stand-ins.
    for stand_in in [
        "Loading…",
        "Loading...",
        "kp-spinner",
        "plateHtml",
        "text-muted\">Loading",
    ] {
        assert!(
            !html.contains(stand_in) && !status.contains(stand_in),
            "stand-in on the status page: {stand_in}"
        );
    }
    // A phone: the freshness line takes its own row instead of overflowing.
    let css = kit_file("static/chassis.css");
    assert!(css.contains(".chassis-status__fresh .kp-refresh__bar > .kp-refresh__line"));
}

/// 2026-10-19 (Kenny: "elk thema heeft al een loading animatie voor dit soort
/// element, gebruik het!"): the passkeys page shows loading, empty and failed
/// through the kp components' own states (the list's busy card and state
/// notes, the code's own states), never a stand-in spinner, plain text or
/// hand-drawn skeleton; a failed read offers the list's own Retry; the
/// dialog holds still while the browser asks; the first step of the
/// walk-through is not claimed done before anyone scanned.
#[test]
fn passkeys_page_uses_the_components_own_states() {
    let pk = kit_file("templates/passkeys.html");
    let js = kit_file("static/chassis.js");
    let start = js
        .find("async function initPasskeys")
        .expect("initPasskeys");
    let end = js[start..].find("\n}\n").expect("end of initPasskeys") + start;
    let block = &js[start..end];
    assert!(
        pk.contains(r#"id="passkeys-list" data-kp-state="loading""#),
        "the list is loading from the first byte"
    );
    assert!(
        pk.contains(r#"data-kp-state="loading" data-kit-qr"#),
        "the code is loading from the first byte"
    );
    for part in [
        "state: 'loading'",
        "state: 'error'",
        "kp-passkeys-retry",
        "kit-passkey-registered",
    ] {
        assert!(block.contains(part), "initPasskeys lost {part}");
    }
    for stand_in in ["spinner", "skeleton", "Loading…", "Loading..."] {
        assert!(
            !block.contains(stand_in) && !pk.contains(&format!("kp-{stand_in}")),
            "a stand-in for the component's own state: {stand_in}"
        );
    }
    assert!(
        !pk.contains(r#"data-state="done"><span class="kp-steplist__mark" aria-hidden="true"></span><span class="kp-steplist__body"><span class="kp-steplist__title">Scan"#),
        "step one is the current step, not a done one"
    );
    let own = kit_file("static/passkeys.js");
    assert!(
        own.contains("holdDialog") && own.contains("'cancel'"),
        "the register dialog must hold still while the browser asks"
    );
}

/// Measured 2026-10-30 (Notifications card): the address fields stopped at
/// a third of their column, and an idle test plate could not share the
/// Send test button's line. Fields span their row; the result area stays
/// empty until a test is sent.
#[test]
fn the_notifications_card_fields_fill_their_row() {
    let js = kit_file("static/notify-card.js");
    assert!(js.contains(r#"notify-card__control" data-kp-formgrid-span="control-value"><input"#));
    assert!(js.contains("const testIdle = () => '';"));
    assert!(
        !js.contains("kp-empty__title"),
        "empty states use the kit's state plate"
    );
}
