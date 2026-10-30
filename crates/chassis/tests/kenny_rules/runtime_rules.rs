//! Rules about held writes, the pause default, the release and optional kit pages.

use crate::fixtures::{kit_file, repo_file};

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
    for off in ["status", "clients", "passkeys", "storage"] {
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
