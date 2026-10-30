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
