//! The small helpers behind a snapshot line: whether an item is public,
//! whether it is sealed, its deprecation note and a signature with stable
//! spacing. Kept apart from the per-item rules in `surface`.

use syn::Visibility;

/// ` [sealed]` when the item carries `#[non_exhaustive]`, empty otherwise.
/// A sealed type can gain a field or a variant without breaking a caller,
/// which is the whole difference between an additive release and a major.
pub(crate) fn sealed(attrs: &[syn::Attribute]) -> &'static str {
    if attrs.iter().any(|a| a.path().is_ident("non_exhaustive")) {
        " [sealed]"
    } else {
        ""
    }
}

/// feat-api-2: record a public item that carries `#[deprecated]`, with the
/// version the attribute names. A deprecation nobody wrote down is how a
/// transition window turns into a surprise removal, so the list this feeds
/// (docs/REMOVALS.md) is compared with this output at every release.
pub(crate) fn note_deprecated(attrs: &[syn::Attribute], path: &str, dep: &mut Vec<String>) {
    let Some(attr) = attrs.iter().find(|a| a.path().is_ident("deprecated")) else {
        return;
    };
    let mut since = None;
    // A bare `#[deprecated]` has no arguments at all; `parse_nested_meta`
    // then reports an error, which is the same case as "no since given".
    let _ = attr.parse_nested_meta(|meta| {
        if meta.path.is_ident("since") {
            since = Some(meta.value()?.parse::<syn::LitStr>()?.value());
        } else {
            let _ = meta.value().and_then(|v| v.parse::<syn::Expr>());
        }
        Ok(())
    });
    dep.push(format!(
        "deprecated {path} since {}",
        since.unwrap_or_else(|| "unknown".to_string())
    ));
}

pub(crate) fn is_public(vis: &Visibility) -> bool {
    matches!(vis, Visibility::Public(_))
}

pub(crate) fn quote<T: quote::ToTokens>(t: &T) -> String {
    let mut s = proc_macro2::TokenStream::new();
    t.to_tokens(&mut s);
    s.to_string()
}

/// One line, stable spacing: the token stream's own spacing varies with the
/// source, and a snapshot that moves when formatting moves is noise.
pub(crate) fn sig_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last_space = false;
    for ch in s.chars() {
        let space = ch.is_whitespace();
        if space {
            if !last_space {
                out.push(' ');
            }
        } else {
            out.push(ch);
        }
        last_space = space;
    }
    out.replace(" ,", ",")
        .replace(" ;", ";")
        .replace("( ", "(")
        .replace(" )", ")")
        .replace(" <", "<")
        .replace("< ", "<")
        .replace(" >", ">")
        .trim()
        .to_string()
}
