//! The kit's page list and navigation: the project's own pages, edits to the
//! kit's pages, the brand and the home path.

use std::sync::Arc;

use super::App;

impl App {
    /// feat-pages-1: a page of the project, in the one list every
    /// navigation renders from (the kit's layout and, through
    /// `GET /api/kit/pages`, a web app). `Page::new(id, title, path)`,
    /// then `.order(n)`, `.group(g)`, `.hidden()` (routable, not listed).
    pub fn page(&mut self, page: crate::shell::pages::Page) -> &mut Self {
        self.pages.push(page);
        self
    }

    /// feat-pages-1: change one of the kit's pages (`status`, `clients`,
    /// `passkeys`): its title, order, group or whether it is listed. Its id
    /// and path stay the kit's.
    pub fn kit_page(
        &mut self,
        id: &str,
        edit: impl Fn(crate::shell::pages::Page) -> crate::shell::pages::Page + Send + Sync + 'static,
    ) -> &mut Self {
        self.kit_page_edits.push((id.to_string(), Box::new(edit)));
        self
    }

    /// feat-pages-1: where the brand link on the left of the navigation
    /// goes (default `/`).
    pub fn brand(&mut self, href: &str) -> &mut Self {
        self.brand = Some(href.to_string());
        self
    }

    /// The brand link's text (default: `AppSpec::name`, the binary's name),
    /// so a service called `homelab-admin` can show "Homelab". Used by the
    /// kit's layout and served in `/api/kit/pages` as `brand.title`.
    pub fn brand_title(&mut self, title: &str) -> &mut Self {
        self.brand_title = Some(title.to_string());
        self
    }

    /// feat-pages-1: where `/` leads when no web app sits at the root
    /// (default: the status page, served at `/` itself).
    pub fn home(&mut self, path: &str) -> &mut Self {
        self.home = Some(path.to_string());
        self
    }

    /// Kenny, 2026-10-02: switch one of the kit's pages off for this
    /// service (`status`, `clients`, `passkeys`): no route, no data
    /// endpoint, no navigation entry. `clients` also takes the client
    /// management API with it; `passkeys` the passkey ceremonies and the
    /// login page's passkey button. Every page is on unless switched off.
    pub fn disable_kit_page(&mut self, id: &str) -> &mut Self {
        self.disabled_kit_pages.push(id.to_string());
        self
    }

    /// feat-pages-1: the project's web app draws the kit's pages too, from
    /// `/api/kit/status`, `/api/kit/clients`, `/api/kit/passkeys` and
    /// `/api/kit/storage`, so every page carries the app's own bar. The kit
    /// then claims no GET page at `/status`, `/clients`, `/passkeys` or
    /// `/storage`; its actions stay.
    /// Needs a web app at the root.
    pub fn kit_pages_in_webapp(&mut self) -> &mut Self {
        self.kit_pages_in_webapp = true;
        self
    }

    /// A link in the dashboard's top navigation (K16): since 3.1.0 a
    /// visible project page in the page registry.
    pub fn nav_entry(&mut self, label: &str, href: &str) -> &mut Self {
        self.dash.nav.push(crate::shell::dashboard::NavEntry {
            label: label.to_string(),
            href: href.to_string(),
        });
        self
    }

    /// A section on the status page (K17).
    pub fn status_section(
        &mut self,
        s: impl crate::shell::dashboard::StatusSection + 'static,
    ) -> &mut Self {
        self.dash.sections.push(Arc::new(s));
        self
    }
}
