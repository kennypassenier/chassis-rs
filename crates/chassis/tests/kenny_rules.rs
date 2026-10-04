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
    assert!(
        !css.contains(".kp-page {") && !css.contains("main {"),
        "chassis.css must leave the page width to kp-themes"
    );
}

/// 2026-10-02: side-by-side elements sit on a grid, so they align and take
/// the same space. The client issue form is the kit's one such row.
#[test]
fn the_issue_form_is_a_grid() {
    let html = kit_file("templates/clients.html");
    assert!(
        html.contains(r#"<form id="issue" class="kp-autogrid issue-form">"#),
        "the issue form must stay on kp-autogrid"
    );
    let css = kit_file("static/chassis.css");
    assert!(
        css.contains(".issue-form {"),
        "its grid knobs live in chassis.css"
    );
    assert!(
        css.contains(".issue-form > .kp-field__help { grid-column: 1 / -1; }"),
        "the help line spans the whole row"
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
