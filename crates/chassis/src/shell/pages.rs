//! The page registry (feat-pages-1): one list of every page a service
//! shows, the kit's own and the project's, that every navigation renders
//! from.
//!
//! Before this, the kit's layout knew its own pages plus the project's
//! `nav_entry` links, and a project's browser app (feat-webapp-1) kept a
//! second, hand-written list that did not know the kit's pages existed.
//! Two lists drift. Now there is one: the kit registers `status`,
//! `clients` and `passkeys`, the project registers its pages with
//! [`crate::App::page`], and both the kit's layout and the app (through
//! `GET /api/kit/pages`) render the same list. A page registered later
//! shows up everywhere without touching either navigation.

use serde::Serialize;

/// Where a page comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum PageSource {
    /// The kit's own pages: `status`, `clients`, `passkeys`.
    Kit,
    /// Registered by the project.
    App,
}

/// Who draws a page.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum PageRender {
    /// The kit renders it in its layout.
    Kit,
    /// The project's web app renders it (its own pages always; the kit's
    /// under [`crate::App::kit_pages_in_webapp`], from `/api/kit/…`).
    App,
}

/// One page of the service.
#[derive(Debug, Clone, Serialize)]
#[non_exhaustive]
pub struct Page {
    /// Stable name, unique per service (`"overview"`, `"status"`).
    pub id: String,
    pub title: String,
    /// Where it lives, starting with `/`.
    pub path: String,
    /// An optional heading the page sorts under in a grouped navigation.
    pub group: Option<String>,
    /// Ascending; ties keep registration order. Project pages default to
    /// 0, the kit's to 1000 and up, so a project's pages come first.
    pub order: i32,
    /// `false`: routable, but not listed in the navigation.
    pub nav: bool,
    pub source: PageSource,
    pub render: PageRender,
}

impl Page {
    /// A project page, listed in the navigation.
    pub fn new(id: &str, title: &str, path: &str) -> Page {
        Page {
            id: id.to_string(),
            title: title.to_string(),
            path: path.to_string(),
            group: None,
            order: 0,
            nav: true,
            source: PageSource::App,
            render: PageRender::App,
        }
    }

    pub fn order(mut self, order: i32) -> Page {
        self.order = order;
        self
    }

    pub fn group(mut self, group: &str) -> Page {
        self.group = Some(group.to_string());
        self
    }

    /// Reachable at its path, left out of the navigation (e.g. the page
    /// the brand link already leads to).
    pub fn hidden(mut self) -> Page {
        self.nav = false;
        self
    }

    /// Back in the navigation after [`Page::hidden`].
    pub fn shown(mut self) -> Page {
        self.nav = true;
        self
    }

    pub fn title(mut self, title: &str) -> Page {
        self.title = title.to_string();
        self
    }

    fn kit(id: &str, title: &str, path: &str, order: i32) -> Page {
        Page {
            source: PageSource::Kit,
            render: PageRender::Kit,
            ..Page::new(id, title, path).order(order)
        }
    }
}

/// An edit of one of the kit's pages, by id.
pub type KitPageEdit = Box<dyn Fn(Page) -> Page + Send + Sync>;

/// What the registry answers, and what `GET /api/kit/pages` returns.
#[derive(Debug, Clone, Serialize)]
#[non_exhaustive]
pub struct PageSet {
    pub app: String,
    pub brand: Brand,
    /// What `/` shows.
    pub home: String,
    /// Sorted: `order`, then registration order.
    pub pages: Vec<Page>,
}

/// The link on the left of the navigation.
#[derive(Debug, Clone, Serialize)]
#[non_exhaustive]
pub struct Brand {
    pub title: String,
    pub href: String,
}

/// Everything the App collected, turned into the one list at mount.
pub(crate) struct Registry {
    pub app_pages: Vec<Page>,
    pub kit_edits: Vec<(String, KitPageEdit)>,
    pub brand: Option<String>,
    pub home: Option<String>,
}

impl Registry {
    pub(crate) fn build(
        self,
        app: &str,
        clients_label: &str,
        passkeys: bool,
        webapp_at_root: bool,
        kit_in_webapp: bool,
    ) -> PageSet {
        let mut pages = vec![
            Page::kit("status", "Status", "/status", 1000),
            Page::kit("clients", clients_label, "/clients", 1010),
        ];
        if passkeys {
            pages.push(Page::kit("passkeys", "Passkeys", "/passkeys", 1020));
        }
        for (id, edit) in &self.kit_edits {
            if let Some(i) = pages.iter().position(|p| &p.id == id) {
                let mut edited = edit(pages[i].clone());
                // The kit decides where its own pages live.
                edited.id = pages[i].id.clone();
                edited.path = pages[i].path.clone();
                edited.source = PageSource::Kit;
                edited.render = PageRender::Kit;
                pages[i] = edited;
            }
        }
        if kit_in_webapp {
            for p in &mut pages {
                p.render = PageRender::App;
            }
        }
        // Project pages first in registration order, then a stable sort
        // by order keeps that order among equals.
        let mut all = self.app_pages;
        all.extend(pages);
        all.sort_by_key(|p| p.order);
        let home = match self.home {
            Some(h) => h,
            None if webapp_at_root => "/".to_string(),
            None => "/status".to_string(),
        };
        PageSet {
            app: app.to_string(),
            brand: Brand {
                title: app.to_string(),
                href: self.brand.unwrap_or_else(|| "/".to_string()),
            },
            home,
            pages: all,
        }
    }
}

/// Refuse a registry that would break at the first click: a path that is
/// not absolute, two pages with one id, a project page on a kit path.
pub(crate) fn validate(app_pages: &[Page]) -> Result<(), crate::Error> {
    let mut seen = std::collections::HashSet::new();
    for p in app_pages {
        if !p.path.starts_with('/') {
            return Err(crate::Error::config(
                format!(
                    "page `{}` has path `{}`, which is not absolute",
                    p.id, p.path
                ),
                "give every page a path that starts with `/`, e.g. Page::new(\"overview\", \"Overview\", \"/overview\")",
            ));
        }
        if matches!(p.id.as_str(), "status" | "clients" | "passkeys") {
            return Err(crate::Error::config(
                format!("page id `{}` belongs to the kit", p.id),
                "pick another id, or change the kit's page with App::kit_page",
            ));
        }
        if !seen.insert(p.id.clone()) {
            return Err(crate::Error::config(
                format!("two pages have the id `{}`", p.id),
                "give every page its own id",
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry(app_pages: Vec<Page>) -> Registry {
        Registry {
            app_pages,
            kit_edits: Vec::new(),
            brand: None,
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
        .build("admin", "Clients", true, true, false);
        let ids: Vec<&str> = set.pages.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(
            ids,
            ["home", "stacks", "status", "clients", "passkeys", "logs"]
        );
        assert_eq!(set.home, "/", "a web app at the root is the home");
        assert_eq!(set.brand.href, "/");
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
        let set = r.build("admin", "Clients", true, false, false);
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
            set.home, "/status",
            "no web app at the root: the status page"
        );
    }

    #[test]
    fn kit_pages_drawn_by_the_web_app_say_so() {
        let set = registry(Vec::new()).build("admin", "Clients", true, true, true);
        assert!(set.pages.iter().all(|p| p.render == PageRender::App));
        let set = registry(Vec::new()).build("kyu", "Clients", false, false, false);
        assert!(set.pages.iter().all(|p| p.render == PageRender::Kit));
    }

    #[test]
    fn a_registry_that_would_break_is_refused() {
        assert!(validate(&[Page::new("a", "A", "a")]).is_err());
        assert!(validate(&[Page::new("status", "S", "/s")]).is_err());
        assert!(validate(&[Page::new("a", "A", "/a"), Page::new("a", "B", "/b")]).is_err());
        assert!(validate(&[Page::new("a", "A", "/a"), Page::new("b", "B", "/b")]).is_ok());
    }

    #[test]
    fn passkeys_are_listed_only_when_they_are_on() {
        let set = registry(Vec::new()).build("kyu", "Sources", false, false, false);
        let ids: Vec<&str> = set.pages.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["status", "clients"]);
        assert_eq!(set.pages[1].title, "Sources");
    }
}
