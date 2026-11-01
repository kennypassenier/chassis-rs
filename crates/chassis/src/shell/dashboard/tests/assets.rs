//! Lints over the embedded templates, stylesheet and scripts: the approved
//! parts, the hooks the shell looks for and the explain blocks. Its own
//! module because these read files, not the dashboard's code.

/// The kit's own CSS or JavaScript as text: the entry file, then every
/// part of it in `static/chassis/` (the entry pulls them in; a source
/// level test asserts on the whole).
fn kit_text(entry: &str) -> String {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("static");
    let mut text = std::fs::read_to_string(root.join(entry)).expect("entry file");
    let ext = entry.rsplit('.').next().expect("extension");
    let mut parts: Vec<_> = std::fs::read_dir(root.join("chassis"))
        .expect("static/chassis")
        .map(|e| e.expect("entry").path())
        .filter(|p| p.extension().is_some_and(|e| e == ext))
        .collect();
    parts.sort();
    for part in parts {
        text.push('\n');
        text.push_str(&std::fs::read_to_string(part).expect("part file"));
    }
    text
}

/// kit-r4 (http-switchboard gap 38): a card the section owns is skipped
/// by every poll and re-read, and the others ask `chassis-settle` first.
#[test]
fn chassis_js_lets_a_section_keep_its_card_state() {
    let js = kit_text("chassis.js");
    assert!(js.contains(
        "const POLLED = '.kp-card[data-kp-state]:not([data-chassis-json]):not([data-chassis-owned])'"
    ));
    assert!(
        js.contains(".kp-card[data-kp-state]:not([data-chassis-owned])"),
        "page re-read"
    );
    assert!(js.contains("new CustomEvent('chassis-settle', { bubbles: true, cancelable: true"));
    for source in ["'poll'", "'reread'"] {
        assert!(
            js.contains(&format!("mayChange(card, want, {source})"))
                || js.contains(&format!("mayChange(c, 'loading', {source})")),
            "{source}"
        );
    }
    let doc = include_str!("../../../../../../docs/DASHBOARD.md");
    assert!(doc.contains("data-chassis-owned") && doc.contains("chassis-settle"));
}

/// kit-r4 (http-switchboard gap 39): the unlayered refresh-bar rules reach
/// only the kit's own header bar, never a section's own `.kp-refresh`.
#[test]
fn refresh_bar_rules_are_scoped_to_the_kits_header() {
    let css = kit_text("chassis.css");
    let mut seen = 0;
    for line in css.lines().filter(|l| l.contains(".kp-refresh__bar")) {
        seen += 1;
        assert!(
            line.trim_start()
                .starts_with(".chassis-fresh .kp-refresh__bar"),
            "unscoped: {line}"
        );
    }
    assert!(seen >= 4, "the rules are still there ({seen})");
    assert!(!css.contains(".chassis-status .kp-refresh"));
}

/// kit-r4: no template or script writes a literal "a" in front of the
/// vocabulary word; the article comes from `vocab_article`.
#[test]
fn no_template_puts_a_literal_a_before_the_vocabulary() {
    let chassis_js = kit_text("chassis.js");
    for (name, text) in [
        (
            "clients.html",
            include_str!("../../../../templates/clients.html"),
        ),
        (
            "layout.html",
            include_str!("../../../../templates/layout.html"),
        ),
        ("chassis.js", chassis_js.as_str()),
    ] {
        for bad in [
            "a {{ vocab.singular",
            "A {{ vocab.singular",
            "a ${singular}",
        ] {
            assert!(!text.contains(bad), "{name} still writes `{bad}`");
        }
    }
}

/// kit-kp11: one empty live toast region in the layout, and the ready
/// signal in chassis.js (event plus promise).
#[test]
fn layout_has_one_toast_region_and_chassis_js_signals_ready() {
    let layout = include_str!("../../../../templates/layout.html");
    assert_eq!(layout.matches("id=\"chassis-toasts\"").count(), 1);
    assert!(
        layout
            .contains("<div id=\"chassis-toasts\" class=\"kp-toasts\" aria-live=\"polite\"></div>")
    );
    let js = kit_text("chassis.js");
    assert!(js.contains("'chassis:ready'") && js.contains("window.chassis"));
}

/// kit-kp11 (clients-issue, approved): one dialog on the 12-column grid
/// with the form card, the live client card, the secret and the command
/// block; a flash button is never set to grow by hand.
#[test]
fn the_issue_dialog_keeps_its_approved_parts() {
    let html = include_str!("../../../../templates/clients.html");
    let css = kit_text("chassis.css");
    for part in [
        "id=\"issue-dialog\"",
        "kp-dialog--wide issue-dialog",
        "grid-template-rows: subgrid",
        "data-kp-usual=",
        "data-kp-secret",
        "data-issue-command",
        "Copy with the token filled in",
        "data-issue-pane=\"result\"",
        "class=\"kp-formgrid issue-form\"",
    ] {
        assert!(
            html.contains(part) || css.contains(part),
            "the issue dialog lost {part}"
        );
    }
    assert!(
        !html.contains("data-kp-width=\"grow\""),
        "a flash button's width is the package's to grow"
    );
}

/// kit-kp11 (clients-manage, round 3, approved; ux-chassis-5: now a page of
/// its own per client): the 12-column composition, built from kp-themes parts
/// used as the package documents them; nothing hand-built stands in for them.
#[test]
fn the_client_page_keeps_its_approved_parts() {
    let html = include_str!("../../../../templates/client.html");
    let css = kit_text("chassis.css");
    let js = kit_text("chassis.js");
    for part in [
        "manage-page",
        "data-kp-secret data-kp-secret-ttl=",
        "data-kp-command=\"bash\"",
        "data-kp-json=",
        "data-kp-requests data-kp-requests-open=\"failed\"",
        "data-kp-type-confirm=\"{{ c.name }}\"",
        "manage-danger__acts",
        "class=\"kp-formgrid manage-test__grid\"",
    ] {
        assert!(html.contains(part), "the client page lost {part}");
    }
    for part in [".manage-grid {", "@container managed (max-width: 39.99rem)"] {
        assert!(css.contains(part), "chassis.css lost {part}");
    }
    for part in [
        "kp-secret-request",
        "setRequests(",
        "bodyBytes: c.body_bytes",
        "runFlashButton",
    ] {
        assert!(js.contains(part), "chassis.js lost {part}");
    }
    // The hand-built request log, token line and copy/busy code are gone.
    for gone in [
        "renderRequests",
        "data-copy-token",
        "data-reveal",
        "token-line",
        "client-dialog",
    ] {
        assert!(
            !html.contains(gone) && !css.contains(gone) && !js.contains(gone),
            "{gone} came back"
        );
    }
}

#[test]
fn the_clients_page_carries_the_command_hooks() {
    let html = include_str!("../../../../templates/clients.html");
    for hook in [
        "data-chassis-command=\"filter-idle\"",
        "data-chassis-command=\"search\"",
        "data-chassis-command=\"issue\"",
        "href=\"/clients/{{ c.id }}\"",
    ] {
        assert!(html.contains(hook), "clients.html lost {hook}");
    }
    assert!(html.contains("{{ counts.idle }}") && !html.contains("9+"));
}
