//! The web app as an installable app (feat-webapp-4): the settings a project
//! may change ([`Pwa`]) and the tags the pages carry. Its own module because
//! the configuration is public API, while the manifest, the icons and the
//! service worker (child modules) are implementation.

mod extras;
mod fields;
mod glyphs;
pub(super) mod icons;
mod manifest;
mod png;
mod routes;
mod worker;

use crate::core::error::Error;
pub use extras::{ShareTarget, Shortcut};
pub use fields::{ClientMode, Dir, Orientation, Reload};

/// How the installed app is framed (`display` in the web app manifest).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[non_exhaustive]
pub enum Display {
    /// Its own window without browser chrome (the default).
    Standalone,
    /// The whole screen, nothing of the system shown.
    Fullscreen,
    /// A window with a minimal back/reload bar.
    MinimalUi,
}

impl Display {
    /// The manifest's spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            Display::Standalone => "standalone",
            Display::Fullscreen => "fullscreen",
            Display::MinimalUi => "minimal-ui",
        }
    }
}

/// kp-themes formal's `--primary` (navy): the address bar and splash colour.
const DEFAULT_THEME_COLOR: &str = "#223659";
/// kp-themes formal's `--background` (paper): the splash screen's ground.
const DEFAULT_BACKGROUND_COLOR: &str = "#faf8f5";

/// What makes a web app installable: `WebApp::pwa(Pwa::new().display(…))`.
/// Every field has a default (the app's brand title, formal's colours), so
/// `Pwa::new()` is already complete; the web app is installable without it.
#[derive(Clone, Debug)]
pub struct Pwa {
    pub(super) name: Option<String>,
    pub(super) short_name: Option<String>,
    pub(super) description: Option<String>,
    pub(super) display: Display,
    pub(super) theme_color: String,
    pub(super) background_color: String,
    pub(super) shortcuts: Vec<Shortcut>,
    pub(super) share_target: Option<ShareTarget>,
    fields: fields::Fields,
}

impl Default for Pwa {
    fn default() -> Self {
        Pwa::new()
    }
}

impl Pwa {
    /// The defaults: standalone, the brand title as the name, formal's colours.
    pub fn new() -> Self {
        Pwa {
            name: None,
            short_name: None,
            description: None,
            display: Display::Standalone,
            theme_color: DEFAULT_THEME_COLOR.into(),
            background_color: DEFAULT_BACKGROUND_COLOR.into(),
            shortcuts: Vec::new(),
            share_target: None,
            fields: fields::Fields::default(),
        }
    }

    /// The name under the icon's install prompt (default: the brand title).
    pub fn name(mut self, name: &str) -> Self {
        self.name = Some(name.into());
        self
    }

    /// The name under the home-screen icon (default: the name cut at 12
    /// characters, which is what Android shows without clipping).
    pub fn short_name(mut self, name: &str) -> Self {
        self.short_name = Some(name.into());
        self
    }

    /// One sentence for the install prompt.
    pub fn description(mut self, text: &str) -> Self {
        self.description = Some(text.into());
        self
    }

    /// `standalone` (default), `fullscreen` or `minimal-ui`.
    pub fn display(mut self, display: Display) -> Self {
        self.display = display;
        self
    }

    /// The colour of the system bar and the default icon (a CSS colour such
    /// as `#223659`).
    pub fn theme_color(mut self, color: &str) -> Self {
        self.theme_color = color.into();
        self
    }

    /// The colour of the splash screen while the app starts.
    pub fn background_color(mut self, color: &str) -> Self {
        self.background_color = color.into();
        self
    }

    /// One entry in the long-press menu of the home-screen icon (at most
    /// four; checked at start).
    pub fn shortcut(mut self, shortcut: Shortcut) -> Self {
        self.shortcuts.push(shortcut);
        self
    }

    /// Show the app in the system's Share sheet; what is shared arrives at
    /// the target's action.
    pub fn share_target(mut self, target: ShareTarget) -> Self {
        self.share_target = Some(target);
        self
    }

    /// Refuse a colour that could break out of the attribute it lands in,
    /// and shortcuts or a share target a browser would drop.
    pub(super) fn validate(&self) -> Result<(), Error> {
        extras::validate(&self.shortcuts, self.share_target.as_ref())?;
        for (what, c) in [
            ("theme_color", &self.theme_color),
            ("background_color", &self.background_color),
        ] {
            let ok = !c.is_empty()
                && c.len() <= 64
                && c.chars().all(|ch| {
                    ch.is_ascii_alphanumeric()
                        || matches!(ch, '#' | '(' | ')' | ',' | '.' | '%' | ' ')
                });
            if !ok {
                return Err(Error::config(
                    format!("Pwa::{what}(\"{c}\") is not a plain CSS colour"),
                    "use a hex colour such as \"#223659\" or a name such as \"navy\"",
                ));
            }
        }
        Ok(())
    }
}

/// One tag a page may already carry: `key` is what a page mentions when it
/// has the tag (compared with quotes removed), `html` is the tag.
pub(super) struct HeadTag {
    pub(super) key: &'static str,
    pub(super) html: String,
}

impl Pwa {
    /// The manifest link; under `Reload::Ask` it carries the policy the
    /// page script reads (`data-chassis-reload`), the one place the server
    /// already writes into every installable page.
    fn manifest_link(&self) -> String {
        let attr = self
            .fields
            .reload
            .attribute()
            .map(|v| format!(" data-chassis-reload=\"{v}\""))
            .unwrap_or_default();
        format!(
            "<link rel=\"manifest\" href=\"{}\"{attr}>",
            routes::MANIFEST_PATH
        )
    }

    /// The tags the pages carry: manifest, theme colour, touch icon.
    pub(super) fn head_tags(&self) -> Vec<HeadTag> {
        vec![
            HeadTag {
                key: "rel=manifest",
                html: self.manifest_link(),
            },
            HeadTag {
                key: "name=theme-color",
                html: format!(
                    "<meta name=\"theme-color\" content=\"{}\">",
                    self.theme_color
                ),
            },
            HeadTag {
                key: "apple-touch-icon",
                html: format!(
                    "<link rel=\"apple-touch-icon\" href=\"{}\">",
                    routes::TOUCH_ICON_PATH
                ),
            },
        ]
    }

    /// All the tags as one string, for the kit's own layout (the login page).
    pub(crate) fn head_html(&self) -> String {
        self.head_tags().iter().map(|t| t.html.as_str()).collect()
    }
}

impl super::WebApp {
    /// The tags to add to the app's HTML pages; `None` when the app is not
    /// installable (opted out, below the root or without the kit runtime).
    pub(super) fn page_tags(&self) -> Option<Vec<HeadTag>> {
        self.installable().map(Pwa::head_tags)
    }

    /// The install settings, when the app is installable at all.
    fn installable(&self) -> Option<&Pwa> {
        self.pwa
            .as_ref()
            .filter(|_| self.at_root() && self.kit_runtime)
    }

    /// The public routes (manifest, worker, icons) for the dashboard mount to
    /// put outside the login; `brand` names the app when `Pwa::name` does not.
    pub(crate) fn pwa_router(&self, brand: &str) -> Option<axum::Router> {
        routes::PwaState::for_app(self, brand).map(routes::router)
    }

    /// The tags for the kit's own pages (the login page), same condition.
    pub(crate) fn pwa_head_html(&self) -> Option<String> {
        self.installable().map(Pwa::head_html)
    }
}
