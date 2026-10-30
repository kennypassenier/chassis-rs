//! The constructors and builders of the small definition types a project hands
//! the dashboard: section assets, the client vocabulary, action buttons and
//! issue-form fields.

use super::*;

impl SectionAssets {
    pub fn new() -> Self {
        Self::default()
    }

    /// A JavaScript module to load with `<script type="module">`.
    pub fn module_script(mut self, path: &str) -> Self {
        self.module_scripts.push(path.to_string());
        self
    }

    /// A stylesheet to load with `<link rel="stylesheet">`.
    pub fn stylesheet(mut self, path: &str) -> Self {
        self.stylesheets.push(path.to_string());
        self
    }

    pub fn is_empty(&self) -> bool {
        self.module_scripts.is_empty() && self.stylesheets.is_empty()
    }
}

impl Vocabulary {
    pub fn new(singular: &str, plural: &str) -> Self {
        Self {
            singular: singular.to_string(),
            plural: plural.to_string(),
            singular_cap: capitalise(singular),
            plural_cap: capitalise(plural),
        }
    }

    /// The shell variable the copy-paste command names its token with
    /// (`SOURCE_TOKEN` for "source"): the singular word, upper-cased, every
    /// run of characters outside A-Z and 0-9 collapsed to one `_`, and
    /// prefixed `KIT_` when it would not start with a letter.
    pub fn token_var(&self) -> String {
        let mut name = String::new();
        for c in self.singular.chars() {
            if c.is_ascii_alphanumeric() {
                name.push(c.to_ascii_uppercase());
            } else if !name.ends_with('_') && !name.is_empty() {
                name.push('_');
            }
        }
        let name = name.trim_matches('_');
        let name = if name.is_empty() { "CLIENT" } else { name };
        let prefix = if name.starts_with(|c: char| c.is_ascii_uppercase()) {
            ""
        } else {
            "KIT_"
        };
        format!("{prefix}{name}_TOKEN")
    }
}

impl Action {
    /// A plain POST button.
    pub fn post(label: &str, route: &str) -> Self {
        Self {
            label: label.to_string(),
            route: route.to_string(),
            method: "POST".to_string(),
            destructive: false,
            confirm: None,
            busy_label: None,
        }
    }

    /// Mark the action destructive with the phrase the armed button shows.
    pub fn destructive(mut self, confirm: &str) -> Self {
        self.destructive = true;
        self.confirm = Some(confirm.to_string());
        self
    }

    /// `DELETE` instead of `POST`.
    pub fn method(mut self, method: &str) -> Self {
        self.method = method.to_string();
        self
    }

    pub fn busy_label(mut self, label: &str) -> Self {
        self.busy_label = Some(label.to_string());
        self
    }
}

impl ClientFormField {
    pub fn text(name: &str, label: &str, placeholder: &str) -> Self {
        Self {
            name: name.into(),
            label: label.into(),
            kind: FieldKind::Text {
                placeholder: placeholder.into(),
            },
        }
    }

    pub fn select(
        name: &str,
        label: &str,
        options: impl Fn() -> Vec<(String, String)> + Send + Sync + 'static,
    ) -> Self {
        Self {
            name: name.into(),
            label: label.into(),
            kind: FieldKind::Select {
                options: Arc::new(options),
            },
        }
    }
}

/// Upper-case the first letter of a word, for the sentence-start forms.
pub(super) fn capitalise(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}
