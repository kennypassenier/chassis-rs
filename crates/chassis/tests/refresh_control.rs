//! [ux-chassis-10] The kit owns ONE refresh control and ONE freshness line.
//! Kenny's decision (form chassis-rs-ux-bevindingen): the control stands in
//! the header row of every page, the interval is one remembered choice shared
//! by every page, and an app listens to the kit's tick instead of drawing a
//! bar of its own. The behaviour (the event, the interval, the section
//! re-read) is locked by the node test `tests/js/refresh_bus.test.mjs`; this
//! file locks what the server ships.
#![cfg(all(feature = "testing", feature = "dashboard"))]

mod support;

use axum::Router;
use chassis::AppSpec;
use chassis::shell::dashboard::{Section, StatusSection};
use chassis::testing::TestApp;
use support::kit_bundle;

/// A server-rendered section that opts in to the kit's tick (and so has no bar).
struct Queue;

impl StatusSection for Queue {
    fn render(&self) -> Section {
        Section {
            title: "Queue".into(),
            explain: "Re-read on the kit's tick.".into(),
            rows: vec![],
            html: Some(
                r#"<div data-chassis-refresh-section="/fragments/queue">3 waiting</div>"#.into(),
            ),
        }
    }
}

async fn app() -> TestApp {
    let spec = AppSpec {
        name: "refreshdemo",
        version: "0.0.0",
        ..Default::default()
    };
    let mut app = TestApp::start_with(spec, Router::new(), |app| {
        app.status_section(Queue);
    })
    .await;
    app.login().await;
    app.issue_client("watcher", &[]).await;
    app
}

/// Counts of the kit's slot and of any control a page draws itself.
fn controls(html: &str) -> (usize, usize) {
    (
        html.matches(r#"class="chassis-fresh""#).count(),
        html.matches("kp-refresh").count() + html.matches("data-kp-refresh").count(),
    )
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn every_kit_page_has_exactly_one_kit_control_and_no_second_bar() {
    let app = app().await;
    for path in ["/", "/storage", "/clients"] {
        let (status, html) = app.page(path).await;
        assert_eq!(status, 200, "{path}");
        assert_eq!(
            controls(&html),
            (1, 0),
            "{path}: one slot, no control drawn by the page"
        );
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_section_that_opts_in_adds_no_bar_of_its_own() {
    let app = app().await;
    let (_, html) = app.page("/").await;
    assert_eq!(html.matches("data-chassis-refresh-section").count(), 1);
    assert_eq!(controls(&html), (1, 0));
}

#[test]
fn the_interval_is_one_remembered_choice_for_every_page() {
    let control = kit_bundle("static/chassis/refresh-control.js");
    assert_eq!(control.matches("remember: 'chassis-refresh'").count(), 1);
    // No page names a key of its own any more.
    for rel in [
        "templates/status.html",
        "templates/storage.html",
        "templates/clients.html",
        "templates/refresh_slot.html",
        "static/chassis.js",
    ] {
        let text = kit_bundle(rel);
        for old in [
            "chassis-status-refresh",
            "chassis-storage-refresh",
            "clients-refresh",
        ] {
            let key = format!(r#"data-kp-remember="{old}""#);
            assert!(!text.contains(&key), "{rel} still names {old}");
        }
    }
    // No page listens to the control itself; they all follow the kit's tick.
    for rel in [
        "static/chassis/status-refresh-wiring.js",
        "static/chassis/storage-refresh.js",
        "static/chassis/clients-refresh.js",
    ] {
        let text = kit_bundle(rel);
        assert!(
            !text.contains("addEventListener('kp-refresh'"),
            "{rel} listens to the control itself"
        );
        assert!(
            text.contains("chassisRefresh.onTick("),
            "{rel} does not follow the kit's tick"
        );
    }
}

#[test]
fn the_web_app_runtime_ships_the_same_control() {
    let runtime = kit_bundle("static/chassis/webapp-runtime.js");
    assert!(runtime.contains("installRefresh"));
    let kit = kit_bundle("static/chassis/refresh-kit.js");
    assert!(kit.contains("win.chassisRefresh = Object.assign(api, { mount })"));
}
