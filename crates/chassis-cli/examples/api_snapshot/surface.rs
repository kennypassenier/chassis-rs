//! One line per public item: functions, structs with their public fields,
//! enums with their variants, traits, aliases, constants and the public
//! methods of inherent impls. Split per item kind so each rule reads on its own.

use syn::{Item, ItemConst, ItemEnum, ItemFn, ItemImpl, ItemMod, ItemStruct, ItemTrait, ItemType};

use crate::text::{is_public, note_deprecated, quote, sealed, sig_text};
use crate::walk::with_segment;

pub(crate) fn items(list: &[Item], module: &str, out: &mut Vec<String>, dep: &mut Vec<String>) {
    for item in list {
        match item {
            Item::Fn(f) if is_public(&f.vis) => fn_item(f, module, out, dep),
            Item::Struct(s) if is_public(&s.vis) => struct_item(s, module, out, dep),
            Item::Enum(e) if is_public(&e.vis) => enum_item(e, module, out, dep),
            Item::Trait(t) if is_public(&t.vis) => trait_item(t, module, out, dep),
            Item::Type(t) if is_public(&t.vis) => type_item(t, module, out, dep),
            Item::Const(c) if is_public(&c.vis) => const_item(c, module, out, dep),
            Item::Impl(i) => impl_item(i, module, out, dep),
            // An inline `mod tests` is private; only a public inline module
            // contributes surface.
            Item::Mod(m) if is_public(&m.vis) => mod_item(m, module, out, dep),
            _ => {}
        }
    }
}

fn fn_item(f: &ItemFn, module: &str, out: &mut Vec<String>, dep: &mut Vec<String>) {
    out.push(format!("fn {module}::{}", sig_text(&quote(&f.sig))));
    note_deprecated(&f.attrs, &format!("{module}::{}", f.sig.ident), dep);
}

fn struct_item(s: &ItemStruct, module: &str, out: &mut Vec<String>, dep: &mut Vec<String>) {
    let ItemStruct {
        attrs,
        ident,
        fields,
        ..
    } = s;
    // Whether the type is sealed decides how a later addition has
    // to be read: a field added to a sealed struct is additive,
    // the same field on an open one breaks every caller that
    // builds it. Without this the comparison can say a field
    // appeared and nothing more (CF-15, 2026-09-10).
    out.push(format!("struct {module}::{ident}{}", sealed(attrs)));
    note_deprecated(attrs, &format!("{module}::{ident}"), dep);
    for f in fields {
        if is_public(&f.vis) {
            let name = f
                .ident
                .as_ref()
                .map(|i| i.to_string())
                .unwrap_or_else(|| "0".to_string());
            out.push(format!(
                "field {module}::{ident}.{name}: {}",
                sig_text(&quote(&f.ty))
            ));
        }
    }
}

fn enum_item(e: &ItemEnum, module: &str, out: &mut Vec<String>, dep: &mut Vec<String>) {
    let ItemEnum {
        attrs,
        ident,
        variants,
        ..
    } = e;
    // Same reasoning as the struct above: a variant added to a
    // sealed enum is additive, on an open one it breaks every
    // exhaustive `match` a consumer wrote.
    out.push(format!("enum {module}::{ident}{}", sealed(attrs)));
    note_deprecated(attrs, &format!("{module}::{ident}"), dep);
    for v in variants {
        out.push(format!("variant {module}::{ident}::{}", v.ident));
    }
}

fn trait_item(t: &ItemTrait, module: &str, out: &mut Vec<String>, dep: &mut Vec<String>) {
    out.push(format!("trait {module}::{}", t.ident));
    note_deprecated(&t.attrs, &format!("{module}::{}", t.ident), dep);
}

fn type_item(t: &ItemType, module: &str, out: &mut Vec<String>, dep: &mut Vec<String>) {
    out.push(format!("type {module}::{}", t.ident));
    note_deprecated(&t.attrs, &format!("{module}::{}", t.ident), dep);
}

fn const_item(c: &ItemConst, module: &str, out: &mut Vec<String>, dep: &mut Vec<String>) {
    out.push(format!(
        "const {module}::{}: {}",
        c.ident,
        sig_text(&quote(&c.ty))
    ));
    note_deprecated(&c.attrs, &format!("{module}::{}", c.ident), dep);
}

fn impl_item(i: &ItemImpl, module: &str, out: &mut Vec<String>, dep: &mut Vec<String>) {
    let ItemImpl {
        self_ty,
        items: inner,
        trait_,
        ..
    } = i;
    // Only inherent impls: a trait impl's methods are the trait's
    // shape, and the trait is already listed.
    if trait_.is_some() {
        return;
    }
    let ty = sig_text(&quote(self_ty));
    for i in inner {
        if let syn::ImplItem::Fn(f) = i
            && is_public(&f.vis)
        {
            out.push(format!("fn {module}::{ty}::{}", sig_text(&quote(&f.sig))));
            note_deprecated(&f.attrs, &format!("{module}::{ty}::{}", f.sig.ident), dep);
        }
    }
}

fn mod_item(m: &ItemMod, module: &str, out: &mut Vec<String>, dep: &mut Vec<String>) {
    if let Some((_, inner)) = &m.content {
        let deeper = with_segment(module, &m.ident.to_string());
        items(inner, &deeper, out, dep);
    }
}
