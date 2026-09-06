//! The generated kit documentation a project carries (K27): `docs/KIT.md`
//! is rendered from `scaffold/docs/KIT.md.tmpl` like every other scaffold
//! file, and the one piece the template cannot know by itself — the knob
//! table — is computed here from the same `AppSpec::knobs()` the parser
//! reads (K31), so the document can never disagree with the binary.

/// The knob table for a service called `name`, as Markdown.
///
/// `AppSpec.name` is `&'static str` because a running service's name is
/// a literal; the CLI knows the name only at run time, from
/// `.chassis.toml`, so it is leaked once per invocation. `chassis` is a
/// short-lived command and the table is rendered once, so the leak is a
/// handful of bytes and not a change to the kit's API.
pub fn knobs_markdown(name: &str) -> String {
    let name: &'static str = Box::leak(name.to_string().into_boxed_str());
    chassis::AppSpec {
        name,
        ..Default::default()
    }
    .knobs_markdown()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// K27: the table is the kit's own, under the project's prefix, with
    /// every knob key present. Drilled red once by asserting a prefix the
    /// name does not produce.
    #[test]
    fn k27_knob_table_uses_the_project_prefix_and_every_key() {
        let table = knobs_markdown("demo-svc");
        assert!(table.contains("| `DEMO_SVC_LISTEN` |"), "{table}");
        for key in chassis::AppSpec::default().knob_keys() {
            assert!(table.contains(&format!("| `{key}` |")), "{key} missing");
        }
    }
}
