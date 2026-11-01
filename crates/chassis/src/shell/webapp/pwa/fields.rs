//! The optional manifest fields of [`Pwa`] that most apps never set:
//! categories, orientation, language and direction, the display fallback
//! chain, the launch handler and the update policy. Their own module so
//! `pwa.rs` stays the short list of what every app sets; each one reaches
//! the manifest only when set, so an app that ignores them gets exactly the
//! manifest it had before.

use serde_json::{Value, json};

use super::{Display, Pwa};

/// Which way the installed app may be rotated (`orientation`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[non_exhaustive]
pub enum Orientation {
    /// Any way the device turns.
    Any,
    /// The device's natural way (portrait on a phone).
    Natural,
    /// Upright or upside down.
    Portrait,
    /// Either sideways.
    Landscape,
    /// Upright only.
    PortraitPrimary,
    /// Sideways, the natural one only.
    LandscapePrimary,
}

impl Orientation {
    /// The manifest's spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            Orientation::Any => "any",
            Orientation::Natural => "natural",
            Orientation::Portrait => "portrait",
            Orientation::Landscape => "landscape",
            Orientation::PortraitPrimary => "portrait-primary",
            Orientation::LandscapePrimary => "landscape-primary",
        }
    }
}

/// The text direction of the manifest's names (`dir`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[non_exhaustive]
pub enum Dir {
    /// Left to right.
    Ltr,
    /// Right to left.
    Rtl,
    /// The browser decides from the text.
    Auto,
}

impl Dir {
    /// The manifest's spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            Dir::Ltr => "ltr",
            Dir::Rtl => "rtl",
            Dir::Auto => "auto",
        }
    }
}

/// What a launch (a shortcut, a share, the icon) does when the app is
/// already open (`launch_handler.client_mode`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[non_exhaustive]
pub enum ClientMode {
    /// The browser picks what suits the platform (the default).
    Auto,
    /// Always a new window, navigated to the launch URL.
    NavigateNew,
    /// The open window, navigated to the launch URL.
    NavigateExisting,
    /// The open window is only focused; the page learns the URL from the
    /// launch queue and decides itself.
    FocusExisting,
}

impl ClientMode {
    /// The manifest's spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            ClientMode::Auto => "auto",
            ClientMode::NavigateNew => "navigate-new",
            ClientMode::NavigateExisting => "navigate-existing",
            ClientMode::FocusExisting => "focus-existing",
        }
    }
}

/// What an open page does when a new release of the app has been installed.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[non_exhaustive]
pub enum Reload {
    /// Reload once per release, at once (the default, and the kit's
    /// behaviour before this setting existed).
    #[default]
    Auto,
    /// Do not reload. The page fires `chassis-pwa-update` on `window` with
    /// `detail: { version, apply() }`; the app decides the moment (not while
    /// someone is typing) and calls `apply()`, which reloads once.
    Ask,
}

impl Reload {
    /// The value of the `data-chassis-reload` attribute the server puts on
    /// the manifest link; `None` for the default, which needs no attribute.
    pub(super) fn attribute(self) -> Option<&'static str> {
        match self {
            Reload::Auto => None,
            Reload::Ask => Some("ask"),
        }
    }
}

/// The settings behind the builder methods below, kept together so `Pwa`
/// carries one field for all of them.
#[derive(Clone, Debug, Default)]
pub(super) struct Fields {
    pub(super) categories: Vec<String>,
    pub(super) orientation: Option<Orientation>,
    pub(super) lang: Option<String>,
    pub(super) dir: Option<Dir>,
    pub(super) display_override: Vec<Display>,
    pub(super) launch_handler: Option<ClientMode>,
    pub(super) reload: Reload,
}

impl Pwa {
    /// What the app is about, for stores and launchers (`["productivity"]`).
    pub fn categories(mut self, categories: &[&str]) -> Self {
        self.fields.categories = categories.iter().map(|c| c.to_string()).collect();
        self
    }

    /// Lock or free the rotation of the installed app.
    pub fn orientation(mut self, orientation: Orientation) -> Self {
        self.fields.orientation = Some(orientation);
        self
    }

    /// The language of the manifest's names, a BCP 47 tag such as `en`.
    pub fn lang(mut self, lang: &str) -> Self {
        self.fields.lang = Some(lang.into());
        self
    }

    /// The text direction of the manifest's names.
    pub fn dir(mut self, dir: Dir) -> Self {
        self.fields.dir = Some(dir);
        self
    }

    /// Display modes to try before [`Pwa::display`], first one the browser
    /// supports wins (`[Fullscreen, Standalone]` falls back to standalone).
    pub fn display_override(mut self, modes: &[Display]) -> Self {
        self.fields.display_override = modes.to_vec();
        self
    }

    /// What a launch does when the app is already open.
    pub fn launch_handler(mut self, mode: ClientMode) -> Self {
        self.fields.launch_handler = Some(mode);
        self
    }

    /// Reload at once on a new release (default) or let the app choose the
    /// moment; see [`Reload`].
    pub fn reload(mut self, reload: Reload) -> Self {
        self.fields.reload = reload;
        self
    }
}

/// The manifest members for the fields that are set.
pub(super) fn extend(m: &mut Value, f: &Fields) {
    if !f.categories.is_empty() {
        m["categories"] = json!(f.categories);
    }
    if let Some(o) = f.orientation {
        m["orientation"] = json!(o.as_str());
    }
    if let Some(l) = &f.lang {
        m["lang"] = json!(l);
    }
    if let Some(d) = f.dir {
        m["dir"] = json!(d.as_str());
    }
    if !f.display_override.is_empty() {
        m["display_override"] = json!(
            f.display_override
                .iter()
                .map(|d| d.as_str())
                .collect::<Vec<_>>()
        );
    }
    if let Some(c) = f.launch_handler {
        m["launch_handler"] = json!({ "client_mode": c.as_str() });
    }
}
