//! The header's ONE overflow menu, the phone's More tab and the page help
//! drawer (ux-chassis-7, -8 and -9): what the registry records, what
//! `GET /api/kit/pages` serves and what the kit's layout draws.
#![cfg(feature = "testing")]

use axum::Router;
use chassis::AppSpec;
use chassis::shell::pages::Page;
use chassis::testing::TestApp;

async fn start() -> TestApp {
    let spec = AppSpec {
        name: "headerdemo",
        version: "0.0.0",
        ..Default::default()
    };
    let mut app = TestApp::start_with(spec, Router::new(), |app| {
        app.page(Page::new("overview", "Overview", "/overview"))
            .page(Page::new("stacks", "Stacks", "/stacks"))
            .page(Page::new("backups", "Backups", "/backups"))
            .page(Page::new("audit", "Audit log", "/audit").secondary())
            .page(
                Page::new("settings", "Settings", "/settings")
                    .secondary()
                    .help("<p>Project words.</p>"),
            );
    })
    .await;
    app.login().await;
    app
}

/// The header's nav element, so a check never reads the tab bar or a drawer.
fn bar(html: &str) -> &str {
    let from = html.find("<nav class=\"kp-nav\"").expect("the bar");
    &html[from..from + html[from..].find("</nav>").expect("the bar closes")]
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn secondary_is_recorded_and_served_with_the_ids_of_the_more_menu() {
    let app = start().await;
    let (status, body) = app.page("/api/kit/pages").await;
    assert_eq!(status, 200, "{body}");
    let json: serde_json::Value = serde_json::from_str(&body).unwrap();
    let flag = |id: &str| {
        json["pages"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == id)
            .unwrap_or_else(|| panic!("page {id}"))["secondary"]
            .clone()
    };
    assert_eq!(flag("audit"), true);
    assert_eq!(flag("overview"), false);
    assert_eq!(
        flag("status"),
        false,
        "the kit's working pages stay in the bar"
    );
    // `more` is what a web app's More tab holds: the listed secondary pages.
    assert_eq!(
        json["more"],
        serde_json::json!(["audit", "settings", "passkeys", "storage"]),
        "the project's secondary pages, then the kit's housekeeping pages"
    );
    // The help travels with the page.
    let settings = json["pages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == "settings")
        .unwrap();
    assert_eq!(settings["help"], "<p>Project words.</p>");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_header_has_exactly_one_more_menu_holding_the_secondary_pages() {
    let app = start().await;
    for path in ["/status", "/clients"] {
        let (status, html) = app.page(path).await;
        assert_eq!(status, 200, "{path}");
        let bar = bar(&html);
        assert_eq!(
            bar.matches("data-chassis-nav-more").count(),
            1,
            "{path}: one More"
        );
        assert_eq!(
            bar.matches("kp-nav__more-button").count(),
            1,
            "{path}: one More button"
        );
        // No page-level "More ▾" any more: its actions live in the one menu.
        assert!(
            !html.contains("More ▾"),
            "{path}: a second More menu came back"
        );
        // Primary pages are links in the bar, secondary ones only in the menu.
        let menu = &bar[bar.find("kp-nav__more-menu").unwrap()..];
        for secondary in ["Audit log", "Settings"] {
            assert!(menu.contains(secondary), "{path}: {secondary} is in More");
            assert_eq!(
                bar.matches(&format!(">{secondary}<")).count(),
                1,
                "{path}: {secondary} once in the bar"
            );
        }
        assert!(bar[..bar.find("kp-nav__more-menu").unwrap()].contains(">Overview<"));
    }
    // The status page's own actions went into that menu.
    let (_, html) = app.page("/status").await;
    let menu = &bar(&html)[bar(&html).find("kp-nav__more-menu").unwrap()..];
    assert!(
        menu.contains("Copy the health address") && menu.contains("Download the status as JSON")
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_phone_tab_bar_has_one_more_tab_and_no_page_twice() {
    let app = start().await;
    let (_, html) = app.page("/status").await;
    let from = html.find("id=\"chassis-tabbar\"").unwrap();
    let tabbar = &html[from..from + html[from..].find("</nav>").unwrap()];
    assert_eq!(tabbar.matches("kp-tabbar__tab--more").count(), 1);
    // Primary pages are tabs; the secondary ones are not.
    for tab in ["Overview", "Stacks", "Backups", "Status", "Clients"] {
        assert!(tabbar.contains(&format!(">{tab}<")), "{tab} is a tab");
    }
    assert!(!tabbar.contains("Audit log"));
    let more = &html[html.find("id=\"chassis-more\"").unwrap()..];
    let more = &more[..more.find("</dialog>").unwrap()];
    for held in ["Audit log", "Settings", "Passkeys", "Help for this page"] {
        assert!(more.contains(held), "More holds {held}");
    }
    for tab in ["Overview", "Stacks", "Backups", "Status", "Clients"] {
        assert!(
            !more.contains(&format!(">{tab}<")),
            "{tab} must not repeat in More"
        );
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn every_kit_page_has_a_help_drawer_with_words_for_that_page() {
    let app = start().await;
    for (path, words) in [("/status", "Check for updates"), ("/clients", "Re-issue")] {
        let (_, html) = app.page(path).await;
        assert!(
            html.contains("data-chassis-help-open"),
            "{path}: the ? is in the bar"
        );
        let drawer = &html[html.find("id=\"chassis-help\"").expect("the drawer")..];
        let drawer = &drawer[..drawer.find("</dialog>").unwrap()];
        assert!(drawer.contains(words), "{path}: help mentions {words}");
        assert!(
            drawer.contains("kp-dialog__close"),
            "{path}: a close button"
        );
    }
    // Helpless pages do not get a "?".
    let (_, anon) = app.page("/login").await;
    assert!(!anon.contains("data-chassis-help-open"));
}

/// [fix-hsb-ux-2] A tab is about 78 px wide, so "Try a translation" was cut
/// to "TRY A TRANSLA…". A page may carry a short label for the tab bar only:
/// the tab uses it, the header and the palette keep the title.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_short_label_is_used_by_the_tab_bar_only() {
    let spec = AppSpec {
        name: "shortdemo",
        version: "0.0.0",
        ..Default::default()
    };
    let mut app = TestApp::start_with(spec, Router::new(), |app| {
        app.page(
            Page::new("translate", "Try a translation", "/translate").short_label("Translate"),
        );
    })
    .await;
    app.login().await;
    let (_, html) = app.page("/status").await;
    let from = html.find("id=\"chassis-tabbar\"").unwrap();
    let tabbar = &html[from..from + html[from..].find("</nav>").unwrap()];
    assert!(
        tabbar.contains(">Translate<"),
        "the tab uses the short label"
    );
    assert!(!tabbar.contains("Try a translation"), "{tabbar}");
    let header = &html[..from];
    assert!(
        header.contains(">Try a translation<"),
        "the header keeps the full title"
    );
    let (_, json) = app.page("/api/kit/pages").await;
    assert!(json.contains(r#""short_label":"Translate""#), "{json}");
}
