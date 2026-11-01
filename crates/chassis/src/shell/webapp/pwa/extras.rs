//! The optional parts of the manifest an app adds itself: home-screen
//! shortcuts (a long press on the icon) and the share target (the app shows
//! up in the system's Share sheet). Both are plain data checked once at
//! start, so a typo is a refusal with a remedy, never a manifest the browser
//! silently ignores.

use serde_json::{Value, json};

use crate::core::error::Error;

/// Most launchers show four shortcuts; the manifest spec leaves the cap to
/// the platform, so more would be dropped without a word.
const MAX_SHORTCUTS: usize = 4;

/// One entry in the long-press menu of the home-screen icon.
#[derive(Debug, Clone)]
pub struct Shortcut {
    name: String,
    url: String,
    short_name: Option<String>,
    description: Option<String>,
}

impl Shortcut {
    /// `name` as the menu shows it, `url` the page it opens (a path in the
    /// app, starting with `/`).
    pub fn new(name: &str, url: &str) -> Self {
        Shortcut {
            name: name.into(),
            url: url.into(),
            short_name: None,
            description: None,
        }
    }

    /// A shorter label where the launcher has little room.
    pub fn short_name(mut self, name: &str) -> Self {
        self.short_name = Some(name.into());
        self
    }

    /// One sentence for assistive technology.
    pub fn description(mut self, text: &str) -> Self {
        self.description = Some(text.into());
        self
    }

    fn json(&self) -> Value {
        let mut v = json!({ "name": self.name, "url": self.url });
        if let Some(s) = &self.short_name {
            v["short_name"] = json!(s);
        }
        if let Some(d) = &self.description {
            v["description"] = json!(d);
        }
        v
    }
}

/// How the app receives what someone shares to it.
#[derive(Debug, Clone)]
pub struct ShareTarget {
    action: String,
    post: bool,
    title: String,
    text: String,
    url: String,
    files: Option<(String, Vec<String>)>,
}

impl ShareTarget {
    /// A GET to `action` (a path in the app) with the shared title, text and
    /// link as the query parameters `title`, `text` and `url`.
    pub fn get(action: &str) -> Self {
        ShareTarget {
            action: action.into(),
            post: false,
            title: "title".into(),
            text: "text".into(),
            url: "url".into(),
            files: None,
        }
    }

    /// The same fields as a form POST (`application/x-www-form-urlencoded`),
    /// for an action that changes something.
    pub fn post(action: &str) -> Self {
        ShareTarget {
            post: true,
            ..ShareTarget::get(action)
        }
    }

    /// Other names for the three fields than `title`, `text` and `url`.
    pub fn params(mut self, title: &str, text: &str, url: &str) -> Self {
        (self.title, self.text, self.url) = (title.into(), text.into(), url.into());
        self
    }

    /// Also accept shared files, as the multipart field `field`, of the given
    /// types (`image/*`, `.pdf`, …). Makes the target a multipart POST.
    pub fn files(mut self, field: &str, accept: &[&str]) -> Self {
        self.post = true;
        self.files = Some((field.into(), accept.iter().map(|a| a.to_string()).collect()));
        self
    }

    fn json(&self) -> Value {
        let mut params = json!({ "title": self.title, "text": self.text, "url": self.url });
        let enctype = match &self.files {
            Some((field, accept)) => {
                params["files"] = json!([{ "name": field, "accept": accept }]);
                "multipart/form-data"
            }
            None => "application/x-www-form-urlencoded",
        };
        let mut v = json!({ "action": self.action, "params": params });
        if self.post {
            v["method"] = json!("POST");
            v["enctype"] = json!(enctype);
        } else {
            v["method"] = json!("GET");
        }
        v
    }
}

/// The manifest members for the shortcuts and the share target, when set.
pub(super) fn extend(m: &mut Value, shortcuts: &[Shortcut], share: Option<&ShareTarget>) {
    if !shortcuts.is_empty() {
        m["shortcuts"] = Value::Array(shortcuts.iter().map(Shortcut::json).collect());
    }
    if let Some(s) = share {
        m["share_target"] = s.json();
    }
}

/// Refuse what a browser would drop: a path outside the app, an empty name,
/// more shortcuts than a launcher shows, a share target without fields.
pub(super) fn validate(shortcuts: &[Shortcut], share: Option<&ShareTarget>) -> Result<(), Error> {
    if shortcuts.len() > MAX_SHORTCUTS {
        return Err(refusal(
            format!("Pwa has {} shortcuts", shortcuts.len()),
            format!("keep at most {MAX_SHORTCUTS}; launchers drop the rest without a word"),
        ));
    }
    for s in shortcuts {
        if s.name.trim().is_empty() {
            return Err(refusal(
                "a Pwa shortcut has an empty name".into(),
                "give it the label the menu shows".into(),
            ));
        }
        app_path("shortcut", &s.url)?;
    }
    if let Some(t) = share {
        app_path("share target", &t.action)?;
        if [&t.title, &t.text, &t.url]
            .iter()
            .any(|p| p.trim().is_empty())
        {
            return Err(refusal(
                "a Pwa share target has an empty parameter name".into(),
                "name the title, text and url fields, or keep the defaults".into(),
            ));
        }
    }
    Ok(())
}

/// A path in the app: starts with one `/` (not `//`, which names another
/// host) and has no scheme.
fn app_path(what: &str, path: &str) -> Result<(), Error> {
    if path.starts_with('/') && !path.starts_with("//") && !path.contains("://") {
        return Ok(());
    }
    Err(refusal(
        format!("the Pwa {what} points at \"{path}\""),
        "use a path inside the app, such as \"/inbox\"".into(),
    ))
}

fn refusal(what: String, remedy: String) -> Error {
    Error::config(what, remedy)
}
