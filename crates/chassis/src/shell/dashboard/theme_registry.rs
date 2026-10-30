//! Reading the theme list out of the vendored `theme-registry.js`, so no
//! consumer keeps a hand-typed copy of it. Its own module because the line
//! parsing is self-contained and is all this needs to know about the file.

use super::Theme;

/// Parse the `{ name: …, label: …, dark: … }` lines of `src`.
pub(super) fn parse(src: &str) -> Vec<Theme> {
    let mut out = Vec::new();
    for line in src.lines() {
        let l = line.trim();
        if !l.starts_with("{ name:") {
            continue;
        }
        let field = |key: &str| -> Option<String> {
            let start = l.find(&format!("{key}: "))? + key.len() + 2;
            let rest = &l[start..];
            let rest = rest.trim_start_matches('\'');
            let end = rest.find(['\'', ',', ' ', '}'])?;
            Some(rest[..end].to_string())
        };
        let label_start = l.find("label: '").map(|i| i + 8);
        let label = label_start
            .and_then(|s| l[s..].find('\'').map(|e| l[s..s + e].to_string()))
            .unwrap_or_default();
        if let (Some(name), Some(dark)) = (field("name"), field("dark")) {
            out.push(Theme {
                name,
                label,
                dark: dark == "true",
            });
        }
    }
    out
}
