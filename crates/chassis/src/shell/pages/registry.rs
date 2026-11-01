//! `Registry::build`: how the kit's own pages, the project's pages and the
//! edits and switches between them become the one ordered [`PageSet`].

use super::{Brand, Page, PageRender, PageSet, PageSource, Registry, help};

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
        if webapp_at_root && !kit_in_webapp && self.app_pages.is_empty() {
            // Medicine Cabinet, 2026-10-30: the kit's own pages drew a bar
            // with only Status, Clients and Storage, because the web app
            // never told the kit its areas. Not an error (an app may want
            // that), so said once at start, with the remedy.
            tracing::warn!(
                "a web app serves the root but no page of its own is registered: the kit's pages \
                 (Status, Clients, Storage) will show only the kit's links in their bar; \
                 register the app's areas with app.page(Page::new(id, title, path)), or draw \
                 the kit's pages inside the app with app.kit_pages_in_webapp()"
            );
        }
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
            more: all
                .iter()
                .filter(|p| p.nav && p.secondary)
                .map(|p| p.id.clone())
                .collect(),
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
        Page::kit("status", "Status", "/status", 1000)
            .hint("Version, health and updates")
            .help(help::STATUS),
        Page::kit("clients", clients_label, "/clients", 1010)
            .hint("The programs that call this service")
            .help(&help::clients(clients_label)),
    ];
    if passkeys {
        pages.push(
            Page::kit("passkeys", "Passkeys", "/passkeys", 1020)
                .hint("Ways to sign in")
                .help(help::PASSKEYS)
                .secondary(),
        );
    }
    if storage {
        pages.push(
            Page::kit("storage", "Storage", "/storage", 1030)
                .hint("What the service stores")
                .help(help::STORAGE)
                .secondary(),
        );
    }
    pages
}
