//! The JSON shapes the templates read for a project's action buttons and
//! issue-form fields. Its own module because it is the one place that escapes
//! a route into an attribute and fills `{id}`; the types themselves are
//! declared in the parent, where the API record keeps them.

use super::*;

/// The five characters that can break out of a double-quoted attribute.
pub(super) fn attr_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

/// The phrase for a destructive action that named none: the honest words for
/// a revoke (its label starts with "revoke"), the generic ones otherwise.
fn default_confirm(label: &str) -> &'static str {
    if label.trim_start().to_lowercase().starts_with("revoke") {
        REVOKE_CONFIRM
    } else {
        DEFAULT_CONFIRM
    }
}

impl Action {
    /// What the template renders: the route with `{id}` filled in and a
    /// confirm phrase whenever the action is destructive. The route is
    /// attribute-escaped here and rendered `|safe`, because minijinja's
    /// auto-escape turns every `/` into `&#x2f;` — correct for a browser,
    /// unreadable for a person and for a consumer's test that asserts
    /// `data-post="/sources/<id>/sync"`.
    pub(super) fn view(&self, id: Option<&str>) -> serde_json::Value {
        let route = match id {
            Some(id) => self.route.replace("{id}", id),
            None => self.route.clone(),
        };
        let route = attr_escape(&route);
        let confirm = if self.destructive {
            Some(
                self.confirm
                    .clone()
                    .unwrap_or_else(|| default_confirm(&self.label).to_string()),
            )
        } else {
            None
        };
        serde_json::json!({
            "label": self.label,
            "route": route,
            "method": self.method,
            "destructive": self.destructive,
            "confirm": confirm,
            "busy_label": self.busy_label,
        })
    }
}

impl ClientFormField {
    pub(super) fn view(&self) -> serde_json::Value {
        match &self.kind {
            FieldKind::Text { placeholder } => serde_json::json!({
                "name": self.name, "label": self.label, "kind": "text", "placeholder": placeholder
            }),
            FieldKind::Select { options } => serde_json::json!({
                "name": self.name, "label": self.label, "kind": "select",
                "options": options().into_iter().map(|(v, l)| serde_json::json!({"value": v, "label": l})).collect::<Vec<_>>()
            }),
        }
    }
}
