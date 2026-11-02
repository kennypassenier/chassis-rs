//! The web app as an installable app (feat-webapp-4): the settings a project
//! may change ([`Pwa`]) and the tags the pages carry. Its own module because
//! the configuration is public API, while the manifest, the icons and the
//! service worker (child modules) are implementation.

mod extras;
mod fields;
mod glyphs;
mod head;
pub(super) mod icons;
mod manifest;
mod png;
mod routes;
mod screenshots;
mod svg;
mod worker;

use crate::core::error::Error;
pub use extras::{ShareTarget, Shortcut};
pub use fields::{ClientMode, Dir, Orientation, Reload};
pub(super) use head::HeadTag;
pub use screenshots::{FormFactor, Screenshot};

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
    pub(super) screenshots: Vec<Screenshot>,
    fields: fields::Fields,
    /// fix-push-meta-1: whether pages carry the `chassis-push` marker; on
    /// until the mount finds push is not mounted.
    #[cfg(feature = "push")]
    pub(super) push_marker: bool,
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
            screenshots: Vec::new(),
            fields: fields::Fields::default(),
            #[cfg(feature = "push")]
            push_marker: true,
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

    /// One picture for the install prompt (call it more than once for
    /// more; checked at start).
    pub fn screenshot(mut self, screenshot: Screenshot) -> Self {
        self.screenshots.push(screenshot);
        self
    }

    /// Refuse a colour that could break out of the attribute it lands in,
    /// and shortcuts, a share target or screenshots a browser would drop.
    pub(super) fn validate(&self) -> Result<(), Error> {
        extras::validate(&self.shortcuts, self.share_target.as_ref())?;
        screenshots::validate(&self.screenshots)?;
        fields::validate(&self.fields)?;
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

impl super::WebApp {
    /// The tags to add to the app's HTML pages; `None` when the app is not
    /// installable (opted out or without the kit runtime).
    pub(super) fn page_tags(&self) -> Option<Vec<HeadTag>> {
        self.installable()
            .map(|p| p.head_tags(svg::present(&self.source)))
    }

    /// The install settings, when the app is installable at all. Where the
    /// app is mounted does not matter: the whole service is the installed
    /// app (scope `/`), the web app only supplies its files and start page.
    fn installable(&self) -> Option<&Pwa> {
        self.pwa.as_ref().filter(|_| self.kit_runtime)
    }

    /// The public routes (manifest, worker, icons) for the dashboard mount to
    /// put outside the login; `brand` names the app when `Pwa::name` does not.
    pub(crate) fn pwa_router(&self, brand: &str) -> Option<axum::Router> {
        routes::PwaState::for_app(self, brand).map(routes::router)
    }

    /// The tags for the kit's own pages (the login page), same condition.
    pub(crate) fn pwa_head_html(&self) -> Option<String> {
        self.installable()
            .map(|p| p.head_html(svg::present(&self.source)))
    }

    /// The head markup for a page the project renders itself (outside the
    /// web app's files, which get it injected): the manifest link, theme
    /// colour, touch icon, tab icons and (with `push`) the push marker, plus
    /// the `<script type="module">` that registers the service worker. The
    /// script is a kit asset, so it runs under `script-src 'self'`. `None`
    /// when the app is not installable. Add it inside `<head>`.
    pub fn pwa_page_head(&self) -> Option<String> {
        self.pwa_head_html().map(|tags| {
            format!(
                "{tags}<script type=\"module\" src=\"/static/chassis/pwa-boot.js?v={}\"></script>",
                crate::shell::assets::asset_version()
            )
        })
    }

    /// The path of the GET share target, when this app is installable and
    /// registered one (the kit guards it against cross-site navigations).
    ///
    /// Only the path: an action may carry a query (`/share?src=pwa`), and the
    /// guard compares paths.
    pub(crate) fn get_share_path(&self) -> Option<&str> {
        let action = self.installable()?.share_target.as_ref()?.get_action()?;
        Some(action.split(['?', '#']).next().unwrap_or(action))
    }

    /// fix-push-meta-1: drop (or restore) the `chassis-push` marker; the
    /// dashboard mount turns it off where push is not mounted.
    #[cfg(feature = "push")]
    pub(crate) fn set_push_marker(&mut self, on: bool) {
        if let Some(p) = self.pwa.as_mut() {
            p.push_marker = on;
        }
    }

    /// Whether the install settings are on (the web app opted in and has
    /// the kit runtime); at most one web app of a service may be.
    pub(crate) fn is_installable(&self) -> bool {
        self.installable().is_some()
    }
}
