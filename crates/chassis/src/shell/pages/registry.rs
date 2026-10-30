//! `Registry::build`: how the kit's own pages, the project's pages and the
//! edits and switches between them become the one ordered [`PageSet`].

use super::{Brand, Page, PageRender, PageSet, PageSource, Registry};

impl Registry {
    pub(crate) fn build(
        self,
        app: &str,
        clients_label: &str,
        passkeys: bool,
        storage: bool,
        webapp_at_root: bool,
        kit_in_webapp: bool,
    ) -> PageSet {
        let mut pages = kit_pages(clients_label, passkeys, storage);
        self.apply_edits(&mut pages);
        pages.retain(|p| !self.disabled.contains(&p.id));
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
        let home = pick_home(self.home, &self.disabled, webapp_at_root, &all);
        PageSet {
            app: app.to_string(),
            brand: Brand {
                title: self.brand_title.unwrap_or_else(|| app.to_string()),
                href: self.brand.unwrap_or_else(|| "/".to_string()),
            },
            home,
            pages: all,
        }
    }

    /// Run the project's edits over the kit's pages. The kit decides where
    /// its own pages live, so id, path, source and render are put back.
    fn apply_edits(&self, pages: &mut [Page]) {
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
    }
}

/// The page `/` leads to: the project's choice, else the web app at the
/// root, else Status, else the first listed page.
fn pick_home(
    chosen: Option<String>,
    disabled: &[String],
    webapp_at_root: bool,
    all: &[Page],
) -> String {
    let status_on = !disabled.iter().any(|d| d == "status");
    let first_listed = |all: &[Page]| {
        all.iter()
            .find(|p| p.nav)
            .map(|p| p.path.clone())
            .unwrap_or_else(|| "/".to_string())
    };
    match chosen {
        Some(h) => h,
        None if webapp_at_root => "/".to_string(),
        None if status_on => "/status".to_string(),
        // Without a status page, `/` leads to the first listed page.
        None => first_listed(all),
    }
}

/// The kit's own pages, as far as this build and configuration have them.
fn kit_pages(clients_label: &str, passkeys: bool, storage: bool) -> Vec<Page> {
    let mut pages = vec![
        Page::kit("status", "Status", "/status", 1000).hint("Version, health and updates"),
        Page::kit("clients", clients_label, "/clients", 1010)
            .hint("The programs that call this service"),
    ];
    if passkeys {
        pages.push(Page::kit("passkeys", "Passkeys", "/passkeys", 1020).hint("Ways to sign in"));
    }
    if storage {
        pages.push(
            Page::kit("storage", "Storage", "/storage", 1030).hint("What the service stores"),
        );
    }
    pages
}
