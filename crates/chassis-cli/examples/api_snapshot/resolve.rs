//! Which module a public method belongs to.
//!
//! A caller reaches `App::start` through the type, so the method's path is
//! the path of the module that DECLARES `App`, wherever the `impl App` block
//! happens to sit (Kenny, 2026-10-30, form chassis-rs-opsplitsen,
//! method-paths: "Methode volgt type"). Splitting a large file then moves an
//! impl block into a child module without the contract reading a removal.
//! Types, functions and constants are untouched: they still keep the path of
//! the module that declares them, so moving one of those is still a break,
//! as decided on 2026-09-10.
//!
//! `surface` cannot know the declaring module while it reads one file, so it
//! writes a method's head as a marker, and `settle` rewrites the markers once
//! every declaration of the crate has been seen.

/// Starts a method line whose module is not settled yet.
const MARK: char = '\u{1}';

/// The head of a method line, `<module>::<Type>`, with the impl block's
/// module kept in a marker until [`settle`] decides it.
pub(crate) fn method_head(module: &str, ty: &str) -> String {
    format!("{MARK}{module}{MARK}{ty}")
}

/// Rewrites every marked method head in `lines` and `dep` to the module
/// that declares its type.
///
/// The declaring module is the nearest one, among the impl block's own
/// module and its ancestors, that declares a struct, enum or alias of that
/// name. An impl of a type declared nowhere on that chain (a sibling module,
/// another crate) keeps the impl block's module, which is what the snapshot
/// recorded before this rule.
pub(crate) fn settle(lines: &mut [String], dep: &mut [String]) {
    let declared = declarations(lines);
    for line in lines.iter_mut().chain(dep.iter_mut()) {
        if line.contains(MARK) {
            *line = rewrite(line, &declared);
        }
    }
}

/// `(module, ident)` of every public struct, enum and type alias.
fn declarations(lines: &[String]) -> Vec<(String, String)> {
    lines
        .iter()
        .filter_map(|l| {
            let path = l
                .strip_prefix("struct ")
                .or_else(|| l.strip_prefix("enum "))
                .or_else(|| l.strip_prefix("type "))?;
            // A struct line may end in a marker such as ` [sealed]`.
            let path = path.split_whitespace().next()?;
            let (module, ident) = path.rsplit_once("::")?;
            Some((module.to_string(), ident.to_string()))
        })
        .collect()
}

/// One marked line, with its head settled.
fn rewrite(line: &str, declared: &[(String, String)]) -> String {
    let mut parts = line.splitn(3, MARK);
    let prefix = parts.next().unwrap_or_default();
    let (Some(module), Some(rest)) = (parts.next(), parts.next()) else {
        panic!("a method line carries both markers: {line:?}");
    };
    let ident = type_ident(rest);
    let home = declared
        .iter()
        .filter(|(m, i)| i == ident && is_self_or_ancestor(m, module))
        .map(|(m, _)| m.as_str())
        .max_by_key(|m| m.len())
        .unwrap_or(module);
    format!("{prefix}{home}::{rest}")
}

/// The bare name of the type a method line starts with: `App` for
/// `App::start(..)`, `Store` for `Store<T>::get(..)`.
fn type_ident(rest: &str) -> &str {
    let end = rest.find(['<', ':', ' ']).unwrap_or(rest.len());
    &rest[..end]
}

fn is_self_or_ancestor(candidate: &str, module: &str) -> bool {
    module == candidate
        || module
            .strip_prefix(candidate)
            .is_some_and(|rest| rest.starts_with("::"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settled(lines: &[&str]) -> Vec<String> {
        let mut lines: Vec<String> = lines.iter().map(|l| l.to_string()).collect();
        settle(&mut lines, &mut []);
        lines
    }

    #[test]
    fn a_method_in_a_child_module_belongs_to_the_declaring_module() {
        let head = method_head("chassis::app::start", "App");
        let out = settled(&[
            "struct chassis::app::App",
            &format!("fn {head}::start(self)"),
        ]);
        assert_eq!(out[1], "fn chassis::app::App::start(self)");
    }

    #[test]
    fn a_method_beside_its_type_keeps_its_module() {
        let head = method_head("chassis::app", "App");
        let out = settled(&[
            "struct chassis::app::App [sealed]",
            &format!("fn {head}::run(self)"),
        ]);
        assert_eq!(out[1], "fn chassis::app::App::run(self)");
    }

    #[test]
    fn the_nearest_declaration_wins_and_a_sibling_does_not_count() {
        let a = method_head("chassis::shell::store::rekey", "Store");
        let b = method_head("chassis::storage::kinds", "Store");
        let out = settled(&[
            "struct chassis::shell::Store",
            "struct chassis::shell::store::Store",
            "struct chassis::storage::db::Store",
            &format!("fn {a}::rekey(&self)"),
            &format!("fn {b}::open()"),
        ]);
        assert_eq!(out[3], "fn chassis::shell::store::Store::rekey(&self)");
        assert_eq!(out[4], "fn chassis::storage::kinds::Store::open()");
    }

    #[test]
    fn a_moved_free_function_still_reads_as_a_move() {
        // Only method heads are settled; a function line is left as written.
        let out = settled(&["fn chassis::app::start::serve()"]);
        assert_eq!(out[0], "fn chassis::app::start::serve()");
    }
}
