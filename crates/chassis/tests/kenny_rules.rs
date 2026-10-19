//! Locks for what Kenny said must always hold (2026-10-02: "Als we altijd
//! in cirkels blijven gaan en fouten terugkomen…"). Each test names the
//! rule and the day it was given; a change that undoes one fails here
//! before it can ship. Rules already locked elsewhere are listed at the
//! bottom with the test that holds them.

use std::path::Path;

fn kit_file(rel: &str) -> String {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(root.join(rel)).unwrap_or_else(|e| panic!("{rel}: {e}"))
}

fn repo_file(rel: &str) -> String {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    std::fs::read_to_string(root.join(rel)).unwrap_or_else(|e| panic!("{rel}: {e}"))
}

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
    assert!(
        html.contains(r#"class="kp-formgrid manage-test__grid" data-kp-formgrid-stack="never""#)
            && html.contains(r#"class="kp-formgrid__actions manage-test__send""#),
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

/// 2026-10-01 (backup pause, refined with the homelab): a write held by a
/// pause waits at most 10 s and is then answered 503 with Retry-After,
/// never left hanging.
#[test]
fn a_held_write_waits_at_most_ten_seconds() {
    let src = kit_file("src/shell/backup.rs");
    assert!(
        src.contains("pub const HELD_WRITE_LIMIT: Duration = Duration::from_secs(10);"),
        "the bound is 10 s"
    );
    assert!(
        kit_file("src/shell/store.rs")
            .contains("writing_blocking_within(crate::shell::backup::HELD_WRITE_LIMIT)"),
        "every kit write goes through the bounded wait"
    );
    let http = kit_file("src/shell/http.rs");
    assert!(
        http.contains("header::RETRY_AFTER") && http.contains("backup::seconds_left()"),
        "the 503 says when to come back"
    );
}

/// 2026-10-01 (backup pause): writes-only is the default mode; full is
/// asked for, and a caller can raise it, never lower it.
#[test]
fn the_pause_defaults_to_writes_only() {
    let src = kit_file("src/shell/backup.rs");
    assert!(
        src.contains("#[default]\n    Writes,"),
        "Mode::Writes is the default"
    );
    assert!(
        src.contains("let mode = asked.max(self.floor);"),
        "raise-only"
    );
}

/// 2026-09-28: releases do not build the consumers ("zij baseren zich op
/// ons, niet omgekeerd"); 2026-10-02: a red run reruns only what failed,
/// and every test run reports its measured duration.
#[test]
fn the_release_runs_once_and_says_how_long() {
    let kit = repo_file("scripts/release-kit.sh");
    assert!(
        !kit.lines()
            .any(|l| !l.trim_start().starts_with('#') && l.contains("check-consumers.sh")),
        "release-kit must not run the consumer builds"
    );
    assert!(
        kit.contains("scripts/test-carry.sh"),
        "the suite goes through test-carry"
    );
    assert!(
        kit.contains("took"),
        "release-kit prints the gate's duration"
    );
    let carry = repo_file("scripts/test-carry.sh");
    assert!(
        carry.contains("tests took"),
        "test-carry prints the duration"
    );
    // 2026-10-04 (test report): suites side by side, and the 57 s scaffold
    // E2E only when its inputs changed.
    assert!(
        carry.contains("cargo nextest run") && carry.contains("not binary(new_project_builds)"),
        "test-carry runs the suites side by side and gates the scaffold E2E on its inputs"
    );
}

// Locked elsewhere, listed so the inventory stays in one place:
// - the web app at the root, /app/… 308 to the root (Kenny, 2026-10-01):
//   shell::webapp::tests::at_the_root_the_app_answers_what_no_route_claims,
//   tests/webapp_live.rs
// - kit pages in the navigation, Overview hidden under the brand
//   (2026-10-01): shell::pages::tests (5)
// - the brand text is the project's (fix-15): pages::tests asserts brand.title
// - backup pause is start/stop with a dead-man and a heartbeat
//   (2026-10-01/02): shell::backup::tests (10)
// - no image for a native service (2026-10-02): chassis-cli
//   the_image_follows_the_deployment_unless_the_project_says_otherwise,
//   tests/new_project_builds.rs
// - a project's own unit directives survive sync (fix-14): chassis-cli tests

/// 2026-10-02: every kit page is optional per app ("alle pagina's moeten
/// optioneel zijn"). A page switched off is gone from the navigation and
/// its route answers 404; the pages left on keep working.
#[cfg(all(feature = "testing", feature = "dashboard"))]
#[tokio::test]
async fn a_disabled_kit_page_is_gone_from_the_nav_and_its_route() {
    use chassis::testing::TestApp;
    let spec = || chassis::AppSpec {
        name: "pagesoff",
        version: "0.0.0",
        ..Default::default()
    };
    for off in ["status", "clients", "passkeys"] {
        let mut app = TestApp::start_with(spec(), axum::Router::new(), move |a| {
            a.disable_kit_page(off);
        })
        .await;
        app.login().await;
        let (status, body) = app.page("/api/kit/pages").await;
        assert_eq!(status, 200, "{off}: {body}");
        assert!(
            !body.contains(&format!(r#""id":"{off}""#)),
            "{off} must not be listed: {body}"
        );
        let (status, _) = app.page(&format!("/{off}")).await;
        assert_eq!(status, 404, "/{off} must not answer once switched off");
        for other in ["status", "clients"].iter().filter(|p| **p != off) {
            let (status, _) = app.page(&format!("/{other}")).await;
            assert_eq!(status, 200, "/{other} stays when only {off} is off");
        }
    }
}

/// 2026-10-19 (kit-kp11, approved demos "login" and "passkeys"): the login
/// page's passkey is the one primary button, the token field has Show/Hide,
/// keep-signed-in is a switch, and a failed login says what, why and what
/// now. The passkeys page lists through the kp component with the approved
/// `data-kp-confirm="dialog"` on the list (kp-themes 11.1.0 arms only real
/// controls, so Rename no longer asks to confirm).
#[test]
fn login_and_passkeys_pages_keep_their_approved_parts() {
    let login = kit_file("templates/login.html");
    for part in [
        "kp-switch",
        "data-kit-peek",
        "kp-alert__what",
        "kp-alert__why",
        "kp-alert__remedy",
        "kp-health",
        "kp-ago",
        "data-passkey-login",
    ] {
        assert!(login.contains(part), "login.html lost {part}");
    }
    let pk = kit_file("templates/passkeys.html");
    for part in [
        "data-kp-passkeys",
        "kp-qr",
        "kp-steplist",
        "data-passkey-register",
    ] {
        assert!(pk.contains(part), "passkeys.html lost {part}");
    }
    assert!(
        pk.contains("data-kp-confirm=\"dialog\""),
        "the passkey list removes through the approved confirm dialog"
    );
    assert!(
        !pk.contains("_TRUSTED_PROXIES") && !pk.contains("_PUBLIC_URL"),
        "the not-HTTPS alert speaks plain words, no variable names"
    );
}

/// Round 3 (Kenny approved 4/4, 2026-10-19 11:22): the login card is one
/// form grid, so label, field, passkey button, switch and Log in share one
/// start edge ("HOE VAAK MOET IK NOG ZEGGEN OM ALLES DEFTIG VERTICAAL TE
/// ALIGNEN"); the phone bar's Search is a 36 px square beside the theme menu.
#[test]
fn login_card_is_one_form_grid_and_phone_search_is_a_square() {
    let login = kit_file("templates/login.html");
    assert!(
        login.contains("class=\"kp-formgrid kit-login__grid\"")
            && login.contains("data-kp-formgrid-stack=\"never\""),
        "the login card is one .kp-formgrid that never stacks"
    );
    for part in [
        "kp-formgrid__label\" for=\"token\"",
        "kp-formgrid__actions\"><button type=\"button\" class=\"kp-button kp-button--ghost\" data-kit-peek",
        "kp-formgrid__row--buttons",
    ] {
        assert!(login.contains(part), "login grid lacks {part}");
    }
    assert!(
        !login.contains("kit-login__token") && !login.contains("kp-form\""),
        "no hand-made side-by-side row beside the grid"
    );
    let css = kit_file("static/chassis.css");
    assert!(
        css.contains("align-items: first baseline;\n  max-inline-size: 64rem"),
        "the intro and the card share a first baseline"
    );
    assert!(
        css.contains("inline-size: var(--kit-bar-button, 2.25rem);")
            && css.contains("block-size: var(--kit-bar-button, 2.25rem);"),
        "the phone's Search is a 36 px square"
    );
    let kp = kit_file("static/kp/dist/kp-themes.css");
    assert!(
        kp.contains(".kp-formgrid") && !css.contains("TEMPORARY: .kp-formgrid"),
        "the form grid comes from the vendored kp-themes (11.1.0), not a kit copy"
    );
}

/// 2026-10-19 (Kenny): every loading, empty and failed state is the
/// component's own, never a stand-in. The login health line is the theme's
/// skeleton while it reads and a kp-health with a normal Try again when it
/// fails; the palette retries through its own plate; the connection line
/// stands on the phone's tab bar.
#[test]
fn shell_and_login_states_use_the_components_own() {
    let js = kit_file("static/chassis.js");
    assert!(
        js.contains("bone.className = 'kp-skeleton'") && js.contains("'aria-busy'"),
        "the health line loads as the theme's skeleton"
    );
    assert!(
        js.contains("kp-palette-retry"),
        "the palette's failed plate retries"
    );
    assert!(
        !js.contains("Loading…") && !js.contains("Loading..."),
        "no plain-text loading stand-in"
    );
    let css = kit_file("static/chassis.css");
    assert!(
        css.contains("inset-block-end: var(--kp-tabbar-height, 0px);"),
        "the connection line stands above the tab bar"
    );
}

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
    assert!(css.contains(".chassis-status .kp-refresh__bar > .kp-refresh__line"));
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
