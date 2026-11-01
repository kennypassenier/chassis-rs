//! The manifest's screenshots: the pictures an install prompt shows (the
//! richer install UI of Chrome and Android). Plain data checked once at
//! start, like the shortcuts, and served from the app's own files outside
//! the login, because the browser fetches them without a session.

use serde_json::{Value, json};

use crate::core::error::Error;

/// The shape of the device a screenshot was taken on (`form_factor`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[non_exhaustive]
pub enum FormFactor {
    /// A phone-shaped window; the install prompt shows it on mobile.
    Narrow,
    /// A desktop-shaped window; the install prompt shows it on desktop.
    Wide,
}

impl FormFactor {
    /// The manifest's spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            FormFactor::Narrow => "narrow",
            FormFactor::Wide => "wide",
        }
    }
}

/// One picture of the app for the install prompt.
#[derive(Debug, Clone)]
pub struct Screenshot {
    path: String,
    sizes: String,
    form_factor: FormFactor,
    label: Option<String>,
}

impl Screenshot {
    /// `path` is a PNG or WebP file of the web app (such as
    /// `/img/today-narrow.png`), `sizes` its pixel size as `WxH`
    /// (`"1080x1920"`). The kit serves the file outside the login, with the
    /// PWA icons; a missing file is a 404.
    pub fn new(path: &str, sizes: &str, form_factor: FormFactor) -> Self {
        Screenshot {
            path: path.into(),
            sizes: sizes.into(),
            form_factor,
            label: None,
        }
    }

    /// A sentence describing the picture, for assistive technology.
    pub fn label(mut self, text: &str) -> Self {
        self.label = Some(text.into());
        self
    }

    /// The MIME type, from the extension (validated before this is used).
    fn mime(&self) -> &'static str {
        if self.path.ends_with(".webp") {
            "image/webp"
        } else {
            "image/png"
        }
    }

    fn json(&self) -> Value {
        let mut v = json!({
            "src": self.path,
            "sizes": self.sizes,
            "type": self.mime(),
            "form_factor": self.form_factor.as_str(),
        });
        if let Some(l) = &self.label {
            v["label"] = json!(l);
        }
        v
    }
}

/// The distinct paths, for the public routes.
pub(super) fn paths(shots: &[Screenshot]) -> Vec<&str> {
    let mut paths: Vec<&str> = shots.iter().map(|s| s.path.as_str()).collect();
    paths.sort_unstable();
    paths.dedup();
    paths
}

/// The `screenshots` member, when any are set.
pub(super) fn extend(m: &mut Value, shots: &[Screenshot]) {
    if !shots.is_empty() {
        m["screenshots"] = Value::Array(shots.iter().map(Screenshot::json).collect());
    }
}

/// Refuse a path that is no plain PNG/WebP file of the app and sizes a
/// browser would drop.
pub(super) fn validate(shots: &[Screenshot]) -> Result<(), Error> {
    for s in shots {
        let p = &s.path;
        let plain = p.starts_with('/')
            && !p.starts_with("//")
            && !p.contains("://")
            && !p.contains(['?', '#', '\\'])
            && !p.split('/').any(|seg| seg == "..")
            && (p.ends_with(".png") || p.ends_with(".webp"));
        if !plain {
            return Err(Error::config(
                format!("the Pwa screenshot \"{p}\" is not a plain PNG or WebP path"),
                "use a path to a .png or .webp file of the app, such as \"/img/today.png\"",
            ));
        }
        if !is_size(&s.sizes) {
            return Err(Error::config(
                format!("the Pwa screenshot \"{p}\" has sizes \"{}\"", s.sizes),
                "write the pixel size as WxH, such as \"1080x1920\"",
            ));
        }
    }
    Ok(())
}

/// `WxH` with both sides plain digits, non-zero.
fn is_size(sizes: &str) -> bool {
    let digits = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()) && s != "0";
    sizes
        .split_once('x')
        .is_some_and(|(w, h)| digits(w) && digits(h))
}
