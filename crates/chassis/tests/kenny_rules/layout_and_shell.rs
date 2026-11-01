//! Rules about page width, dialogs, the brand and the shell registry.

use crate::fixtures::kit_file;

/// 2026-09-30 (3.0.2): pages use 80 % of the window (kp-themes `.kp-page`);
/// chassis's own CSS may cap prose (`.explain`) and dialogs, never a page.
#[test]
fn chassis_css_caps_only_prose_and_dialogs_never_the_page() {
    let css = kit_file("static/chassis.css");
    let mut selector = String::new();
    for line in css.lines() {
        let t = line.trim();
        if t.ends_with('{') {
            selector = t.trim_end_matches('{').trim().to_string();
        }
        if t.starts_with("max-width:") {
            assert_eq!(
                selector, ".explain",
                "a max-width outside .explain would narrow a page: {selector} {t}"
            );
        }
    }
    // Whole selectors only: `.issue-main {` is a grid area, not the page.
    let styles_the_page = css.lines().any(|l| {
        let sel = l.trim().trim_end_matches('{').trim();
        l.trim().ends_with('{') && (sel == ".kp-page" || sel == "main")
    });
    assert!(
        !styles_the_page,
        "chassis.css must leave the page width to kp-themes"
    );
}

/// 2026-10-02: side-by-side elements sit on a grid, so they align and take
/// the same space. 2026-10-19 (Kenny, "HOE VAAK MOET IK NOG ZEGGEN OM ALLES
/// DEFTIG VERTICAAL TE ALIGNEN EN GRID TE GEBRUIKEN IPV LINKS ALIGNEN???"):
/// the client dialogs are rows of kp-themes' form grid, never fields placed by
/// hand. The issue fields fill their cell (no 28rem cap) and the manage
/// dialog's test is one row with Send test on the line of Format and Minify.
#[test]
fn the_client_dialogs_are_form_grids() {
    let html = kit_file("templates/clients.html");
    assert!(
        html.contains(r#"<div class="kp-formgrid issue-form">"#),
        "the issue fields must stay rows of one .kp-formgrid"
    );
    assert!(
        !html.contains("kp-autogrid"),
        "the old auto grid is gone from the clients page"
    );
    let client = kit_file("templates/client.html");
    assert!(
        client.contains(r#"class="kp-formgrid manage-test__grid" data-kp-formgrid-stack="never""#)
            && client.contains(r#"class="kp-formgrid__actions manage-test__send""#),
        "the manage test is one form-grid row, Send test on the actions track"
    );
    let css = kit_file("static/chassis.css");
    assert!(
        css.contains(".issue-form { --kp-field-max-width: none; }")
            && css.contains("--kp-field-max-width: none;"),
        "a field fills its track: nothing caps it below the cell"
    );
}

/// 2026-10-01 (feat-pages-1): the brand link follows the registry, and its
/// text is the project's (fix-15), in the kit's own layout too.
#[test]
fn the_layout_brand_comes_from_the_registry() {
    let html = kit_file("templates/layout.html");
    assert!(
        html.contains(
            r#"<a class="kp-nav__brand" href="{{ brand_href | default('/') }}">{{ brand_title | default(app_name) }}</a>"#
        ),
        "the brand's link and text come from the page registry"
    );
    assert!(
        html.contains("{% for item in nav %}"),
        "the kit's navigation renders the registry's visible pages"
    );
}

/// kit-kp11 (Kenny approved the shell demo, 2026-10-19): the bar, the search
/// palette and the phone's tab bar render from the page registry, never from
/// a list written into the layout; a tab's count is the exact number; the
/// phone hides the links, Log out and the Search word; the error page has a
/// copyable request id, a drawing per kind and no alert class the package
/// does not have.
#[test]
fn the_shell_renders_from_the_registry_and_counts_exactly() {
    let layout = kit_file("templates/layout.html");
    for hard_coded in [
        r#"href="/status""#,
        r#"href="/clients""#,
        r#"href="/passkeys""#,
    ] {
        assert!(
            !layout.contains(hard_coded),
            "the layout lists pages from `nav`, not {hard_coded}"
        );
    }
    assert!(
        layout.matches("{% for item in nav %}").count() >= 4,
        "bar, palette, tab bar and drawer each loop over the registry"
    );
    for part in [
        "data-kp-nav-fold",
        r#"data-kp-palette-open="chassis-palette""#,
        r#"data-kp-hotkey="k""#,
        "data-kp-shortcuts-live",
        r#"class="kp-tabbar chassis-tabbar""#,
        r#"id="chassis-more""#,
        "data-kp-connection",
    ] {
        assert!(layout.contains(part), "the shell lacks {part}");
    }
    let js = kit_file("static/chassis.js");
    assert!(
        js.contains("setTabbarBadge") && !js.contains("99+"),
        "a count on a tab is the exact number"
    );
    // One idle rule (Kenny, kit-kp11): the badge shows the server's
    // `counts.idle`, the same number as the Clients page; the shell block
    // never computes idleness (no 30-day arithmetic, no own filter).
    let shell = js
        .split("// ====================================================================== shell ==")
        .nth(1)
        .expect("the shell block");
    assert!(
        shell.contains("data.counts.idle"),
        "the tab badge reads counts.idle"
    );
    // The server writes the same number into every signed-in page, so the
    // shell never reads the clients at load for the badge.
    let layout_src = kit_file("templates/layout.html");
    assert!(
        layout_src.contains("idle_clients") && layout_src.contains("kp-tabbar__badge"),
        "the layout writes the idle count on the Clients tab"
    );
    let dash = kit_file("src/shell/dashboard.rs");
    assert!(
        dash.contains("client_list::counts(") && dash.contains("fn idle_clients"),
        "the server's idle count is client_list's own counts.idle"
    );
    assert!(
        !shell.contains("loadClients();\n      paletteEl"),
        "the shell reads the clients when the palette opens, not at load"
    );
    for own in ["86400000", "* 30", "30 *", "issued_at", "filter(idle"] {
        assert!(
            !shell.contains(own),
            "the shell block computes idleness itself ({own}); read counts.idle instead"
        );
    }
    // Signed out (the login page) the bar is the brand and the theme menu
    // only: every other part of the shell sits inside `logged_in`.
    for part in [
        r#"<ul class="kp-nav__links" aria-hidden="true"></ul>"#,
        "{% if logged_in %}\n  <!-- kit-kp11: Search",
        "{% if logged_in and not open_dashboard %}\n  <form",
    ] {
        assert!(
            layout.contains(part),
            "the signed-out bar lacks its guard: {part}"
        );
    }
    assert!(
        layout.contains("{% if logged_in %}\n<!-- kit-kp11 shell: the search palette")
            && layout
                .contains("<nav class=\"kp-nav\"{% if logged_in %} data-kp-nav-fold{% endif %}"),
        "palette, tab bar and drawer are drawn only when signed in"
    );
    let css = kit_file("static/chassis.css");
    let phone = css
        .split("@media (max-width: 39.99rem)")
        .nth(1)
        .expect("a phone block");
    for hidden in [".kp-nav__links", ".chassis-logout", ".chassis-search-word"] {
        assert!(phone.contains(hidden), "the phone hides {hidden}");
    }
    assert!(
        css.contains(".chassis-tabbar .kp-tabbar__badge"),
        "badge beside its icon"
    );
    assert!(
        css.contains("white-space: nowrap"),
        "a chord stays on one line"
    );
    let error = kit_file("templates/error.html");
    assert!(
        !error.contains("kp-alert--danger"),
        "no class the package lacks"
    );
    assert!(
        error.contains("data-kp-copy")
            && error.contains("request_id")
            && error.contains("data-kp-art"),
        "the request id is copyable and the plate has its drawing"
    );
}
