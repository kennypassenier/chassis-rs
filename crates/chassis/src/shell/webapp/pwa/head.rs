//! The tags the pages carry so a browser finds the manifest, the colours and
//! the icons: injected into the web app's HTML pages and written by the
//! kit's own layout.

use super::{Pwa, routes};

/// One tag a page may already carry: `key` is what a page mentions when it
/// has the tag (compared with quotes removed), `html` is the tag.
pub(in crate::shell::webapp) struct HeadTag {
    pub(in crate::shell::webapp) key: &'static str,
    pub(in crate::shell::webapp) html: String,
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

    /// The tags the pages carry: manifest, theme colour, touch icon and the
    /// tab icon (the app's own icon, so the tab is not the browser's blank).
    pub(in crate::shell::webapp) fn head_tags(&self) -> Vec<HeadTag> {
        #[allow(unused_mut)]
        let mut tags = vec![
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
            HeadTag {
                key: "rel=icon",
                html: format!(
                    "<link rel=\"icon\" href=\"{}\" type=\"image/png\">",
                    routes::ICON_192_PATH
                ),
            },
        ];
        // habits-push-1: tells the page script (push.js) that the server
        // has Web Push; `window.chassisPush` exists only where this is.
        #[cfg(feature = "push")]
        tags.push(HeadTag {
            key: "name=chassis-push",
            html: "<meta name=\"chassis-push\" content=\"/api/kit/push\">".to_string(),
        });
        tags
    }

    /// All the tags as one string, for the kit's own layout (every kit page).
    pub(crate) fn head_html(&self) -> String {
        self.head_tags().iter().map(|t| t.html.as_str()).collect()
    }
}
