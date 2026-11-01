//! The page registry (feat-pages-1): one list of every page a service
//! shows, the kit's own and the project's, that every navigation renders
//! from.
//!
//! Before this, the kit's layout knew its own pages plus the project's
//! `nav_entry` links, and a project's browser app (feat-webapp-1) kept a
//! second, hand-written list that did not know the kit's pages existed.
//! Two lists drift. Now there is one: the kit registers `status`,
//! `clients`, `passkeys` and `storage`, the project registers its pages with
//! [`crate::App::page`], and both the kit's layout and the app (through
//! `GET /api/kit/pages`) render the same list. A page registered later
//! shows up everywhere without touching either navigation.

mod checks;
mod help;
mod registry;

pub(crate) use checks::validate;

use serde::Serialize;

/// Where a page comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum PageSource {
    /// The kit's own pages: `status`, `clients`, `passkeys`, `storage`.
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
    /// One line that says what the page is for; the palette and the phone's
    /// More drawer print it under the title. The kit's pages carry one.
    pub hint: Option<String>,
    /// `true`: listed in the header's one overflow menu ("More") and in the
    /// phone's More tab instead of the bar ([`Page::secondary`]). The kit's
    /// own Passkeys and Storage pages are secondary by default.
    pub secondary: bool,
    /// Plain-English help for the page, as trusted HTML: what it shows and
    /// what each action does. The kit's layout shows it in the "?" drawer
    /// of the header; a web app reads it from `GET /api/kit/pages`.
    pub help: Option<String>,
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
            hint: None,
            secondary: false,
            help: None,
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

    /// The line under the title in the palette and the More drawer.
    pub fn hint(mut self, hint: &str) -> Page {
        self.hint = Some(hint.to_string());
        self
    }

    /// Move the page into the header's one "More" overflow menu (and the
    /// phone's More tab), together with the kit's own secondary pages. The
    /// page stays routable and searchable; the bar keeps room for the pages
    /// people use all day.
    pub fn secondary(mut self) -> Page {
        self.secondary = true;
        self
    }

    /// Back in the bar after [`Page::secondary`] (e.g. a kit page the
    /// project wants as a tab: `App::kit_page("storage", |p| p.primary())`).
    pub fn primary(mut self) -> Page {
        self.secondary = false;
        self
    }

    /// The help the "?" in the header opens for this page: plain English,
    /// as trusted HTML (`<p>`, `<h3>`, `<ul>`, `<strong>`). Written by the
    /// project, never user input.
    pub fn help(mut self, html: &str) -> Page {
        self.help = Some(html.to_string());
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
    /// The ids of the listed (`nav`) secondary pages, in order: what the
    /// header's More menu and the phone's More tab hold. A web app with its
    /// own tab bar hosts one "More" tab with exactly these.
    pub more: Vec<String>,
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
    /// The brand's text; `None` keeps the service's name.
    pub brand_title: Option<String>,
    pub home: Option<String>,
    /// Kit pages the project switched off (`App::disable_kit_page`).
    pub disabled: Vec<String>,
}

/// The kit's own pages, by id, the ones `App::disable_kit_page` accepts.
pub const KIT_PAGES: &[&str] = &["status", "clients", "passkeys", "storage"];

#[cfg(test)]
mod tests;
