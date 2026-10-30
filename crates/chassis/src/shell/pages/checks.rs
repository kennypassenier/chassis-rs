//! The start-up check on the project's page list.

use super::{KIT_PAGES, Page};

/// Refuse a registry that would break at the first click: a path that is
/// not absolute, two pages with one id, a project page on a kit path.
pub(crate) fn validate(app_pages: &[Page]) -> Result<(), crate::Error> {
    let mut seen = std::collections::HashSet::new();
    for p in app_pages {
        if !p.path.starts_with('/') {
            return Err(crate::Error::config(
                format!(
                    "page `{}` has path `{}`, which is not absolute",
                    p.id, p.path
                ),
                "give every page a path that starts with `/`, e.g. Page::new(\"overview\", \"Overview\", \"/overview\")",
            ));
        }
        if KIT_PAGES.contains(&p.id.as_str()) {
            return Err(crate::Error::config(
                format!("page id `{}` belongs to the kit", p.id),
                "pick another id, or change the kit's page with App::kit_page",
            ));
        }
        if !seen.insert(p.id.clone()) {
            return Err(crate::Error::config(
                format!("two pages have the id `{}`", p.id),
                "give every page its own id",
            ));
        }
    }
    Ok(())
}
