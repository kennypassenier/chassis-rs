//! Unit tests for `pages`; kept in their own file so the module stays small.

use super::*;

fn registry(app_pages: Vec<Page>) -> Registry {
    Registry {
        app_pages,
        kit_edits: Vec::new(),
        brand: None,
        brand_title: None,
        disabled: Vec::new(),
        home: None,
    }
}

#[test]
fn project_pages_come_first_in_their_own_order_then_the_kits() {
    let set = registry(vec![
        Page::new("home", "Home", "/"),
        Page::new("stacks", "Stacks", "/stacks"),
        Page::new("logs", "Logs", "/logs").order(2000),
    ])
    .build("admin", "Clients", true, true, true, false);
    let ids: Vec<&str> = set.pages.iter().map(|p| p.id.as_str()).collect();
    assert_eq!(
        ids,
        [
            "home", "stacks", "status", "clients", "passkeys", "storage", "logs"
        ]
    );
    assert_eq!(set.home, "/", "a web app at the root is the home");
    assert_eq!(set.brand.href, "/");
    assert_eq!(
        set.brand.title, "admin",
        "without brand_title the service's name"
    );
}

#[test]
fn the_kits_pages_can_be_reordered_hidden_and_renamed_but_not_moved() {
    let mut r = registry(vec![
        Page::new("overview", "Overview", "/overview").hidden(),
    ]);
    r.kit_edits.push((
        "clients".into(),
        Box::new(|p| p.order(-5).group("Service").title("Sources")),
    ));
    r.kit_edits
        .push(("passkeys".into(), Box::new(|p| p.hidden().order(5))));
    r.kit_edits.push((
        "status".into(),
        Box::new(|mut p| {
            p.path = "/elsewhere".into();
            p
        }),
    ));
    r.brand = Some("/overview".into());
    r.brand_title = Some("Homelab".into());
    let set = r.build("admin", "Clients", true, true, false, false);
    let clients = &set.pages[0];
    assert_eq!(
        (
            clients.id.as_str(),
            clients.title.as_str(),
            clients.group.as_deref()
        ),
        ("clients", "Sources", Some("Service"))
    );
    assert!(!set.pages.iter().find(|p| p.id == "passkeys").unwrap().nav);
    assert!(!set.pages.iter().find(|p| p.id == "overview").unwrap().nav);
    assert_eq!(
        set.pages.iter().find(|p| p.id == "status").unwrap().path,
        "/status",
        "the kit decides where its pages live"
    );
    assert_eq!(set.brand.href, "/overview");
    assert_eq!(
        set.brand.title, "Homelab",
        "the brand's text is the project's, not the binary name"
    );
    assert_eq!(
        set.home, "/status",
        "no web app at the root: the status page"
    );
}

#[test]
fn kit_pages_drawn_by_the_web_app_say_so() {
    let set = registry(Vec::new()).build("admin", "Clients", true, true, true, true);
    assert!(set.pages.iter().all(|p| p.render == PageRender::App));
    let set = registry(Vec::new()).build("kyu", "Clients", false, false, false, false);
    assert!(set.pages.iter().all(|p| p.render == PageRender::Kit));
}

#[test]
fn a_registry_that_would_break_is_refused() {
    assert!(validate(&[Page::new("a", "A", "a")]).is_err());
    assert!(validate(&[Page::new("status", "S", "/s")]).is_err());
    assert!(validate(&[Page::new("storage", "S", "/s")]).is_err());
    assert!(validate(&[Page::new("a", "A", "/a"), Page::new("a", "B", "/b")]).is_err());
    assert!(validate(&[Page::new("a", "A", "/a"), Page::new("b", "B", "/b")]).is_ok());
}

#[test]
fn storage_is_a_kit_page_with_a_hint_and_goes_when_it_is_switched_off() {
    let set = registry(Vec::new()).build("kyu", "Clients", false, true, false, false);
    let storage = set.pages.iter().find(|p| p.id == "storage").unwrap();
    assert_eq!(storage.path, "/storage");
    assert_eq!(storage.hint.as_deref(), Some("What the service stores"));
    assert!(
        set.pages.iter().all(|p| p.hint.is_some()),
        "every kit page says what it is for, so the palette and the drawer can"
    );
    let set = registry(Vec::new()).build("kyu", "Clients", false, false, false, false);
    assert!(set.pages.iter().all(|p| p.id != "storage"));
}

#[test]
fn passkeys_are_listed_only_when_they_are_on() {
    let set = registry(Vec::new()).build("kyu", "Sources", false, false, false, false);
    let ids: Vec<&str> = set.pages.iter().map(|p| p.id.as_str()).collect();
    assert_eq!(ids, ["status", "clients"]);
    assert_eq!(set.pages[1].title, "Sources");
}

/// What `build` logs, captured on this thread only.
fn build_logs(app_pages: Vec<Page>, webapp_at_root: bool, kit_in_webapp: bool) -> String {
    #[derive(Clone, Default)]
    struct Capture(std::sync::Arc<std::sync::Mutex<Vec<u8>>>);
    impl std::io::Write for Capture {
        fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(b);
            Ok(b.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let cap = Capture::default();
    let writer = cap.clone();
    let subscriber = tracing_subscriber::fmt()
        .with_writer(move || writer.clone())
        .with_ansi(false)
        .finish();
    tracing::subscriber::with_default(subscriber, || {
        registry(app_pages).build("med", "Clients", false, true, webapp_at_root, kit_in_webapp);
    });
    String::from_utf8(cap.0.lock().unwrap().clone()).unwrap()
}

/// Medicine Cabinet, 2026-10-30: a web app at the root that registers none of
/// its areas leaves the kit's pages with a bar of kit links only; the start
/// says so, with the remedy, and stays quiet when the app did its part.
#[test]
fn a_root_web_app_without_its_own_pages_is_warned_about() {
    let quiet = build_logs(vec![Page::new("today", "Today", "/")], true, false);
    assert!(!quiet.contains("no page of its own"), "{quiet}");
    let loud = build_logs(Vec::new(), true, false);
    assert!(loud.contains("no page of its own is registered"), "{loud}");
    assert!(
        loud.contains("app.page(Page::new"),
        "names the remedy: {loud}"
    );
    assert!(
        build_logs(Vec::new(), false, false).is_empty(),
        "no web app at the root"
    );
    assert!(
        build_logs(Vec::new(), true, true).is_empty(),
        "kit pages drawn by the app"
    );
}

#[test]
fn secondary_pages_are_recorded_and_the_kits_housekeeping_pages_are_secondary() {
    let set = registry(vec![
        Page::new("home", "Home", "/"),
        Page::new("logs", "Logs", "/logs").secondary(),
        Page::new("hidden", "Hidden", "/hidden")
            .secondary()
            .hidden(),
    ])
    .build("admin", "Clients", true, true, true, false);
    let secondary: Vec<&str> = set
        .pages
        .iter()
        .filter(|p| p.secondary)
        .map(|p| p.id.as_str())
        .collect();
    assert_eq!(
        secondary,
        ["logs", "hidden", "passkeys", "storage"],
        "kit housekeeping pages go to More"
    );
    assert_eq!(
        set.more,
        ["logs", "passkeys", "storage"],
        "a hidden page is not in More"
    );
    assert!(!Page::new("a", "A", "/a").secondary().primary().secondary);
}

#[test]
fn a_page_may_carry_a_short_label_for_the_tab_bar_and_keeps_its_title() {
    let page = Page::new("translate", "Try a translation", "/translate");
    assert_eq!(page.short_label, None, "no short label unless asked for");
    let page = page.short_label("Translate");
    assert_eq!(page.short_label.as_deref(), Some("Translate"));
    assert_eq!(page.title, "Try a translation", "the title is untouched");
}

#[test]
fn every_kit_page_carries_its_own_help_and_a_project_can_replace_it() {
    let mut r = registry(Vec::new());
    r.kit_edits
        .push(("storage".into(), Box::new(|p| p.help("<p>Ours.</p>"))));
    let set = r.build("admin", "Apps", true, true, false, false);
    let help = |id: &str| {
        set.pages
            .iter()
            .find(|p| p.id == id)
            .unwrap()
            .help
            .clone()
            .unwrap()
    };
    assert!(help("status").contains("Check for updates"));
    assert!(help("clients").contains("Re-issue"));
    assert!(help("passkeys").contains("Register this device"));
    assert_eq!(help("storage"), "<p>Ours.</p>");
    // Without the edit, Storage explains what "pending writes" is.
    let plain = registry(Vec::new()).build("admin", "Apps", true, true, false, false);
    let storage = plain.pages.iter().find(|p| p.id == "storage").unwrap();
    let words = storage.help.as_deref().unwrap();
    assert!(
        words.contains("Pending writes") && words.contains("budget") && words.contains("Clean up")
    );
}
