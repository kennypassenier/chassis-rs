//! The minijinja environment of the dashboard: the embedded templates, the
//! filters and the globals every template reads. Its own module because it is
//! the one place that knows which templates exist and which names they get.

use super::*;

/// How many primary pages the phone tab bar shows beside More (Kenny's
/// release-470, "Max 4 plus More"): six tabs at 390 px left 65 px each, too
/// narrow for a readable label, so the rest is behind More.
pub(crate) const PHONE_TABS: usize = 4;

/// Build the environment for a dashboard named `app_name` whose navigation is
/// `kit_nav` and whose clients are called `vocab`.
pub(super) fn build(
    app_name: &'static str,
    open: bool,
    prefix: &str,
    kit_nav: &[NavEntry],
    clients_label: &str,
    vocab: &Vocabulary,
) -> Result<Environment<'static>, Error> {
    let mut env = Environment::new();
    add_templates(&mut env)?;
    // feat-ui-1: every template renders a timestamp through this, so
    // there is one place that decides what a reader sees.
    env.add_filter("human_time", |v: String| crate::shell::time::human_time(&v));
    // kit-kp11: dd/mm/yyyy HH:mm, 24 hours (UI principles, rule 52); the
    // page shows it in the reader's zone once the script has run.
    env.add_filter("kit_when", |v: String| sections::when_words(&v));
    env.add_global("app_name", app_name);
    env.add_global("open_dashboard", open);
    env.add_global("prefix", prefix.to_string());
    env.add_global("assets", asset_version());
    env.add_global("themes", minijinja::Value::from_serialize(themes()));
    // kp-themes split delivery: what theme-boot.js needs to write the worn
    // theme's register link before first paint (see the layout's head).
    // Under the versioned root (fix-warm-1), so a warm load does not ask
    // for the worn register again.
    env.add_global(
        "register_pattern",
        crate::shell::assets::versioned_static(REGISTER_PATTERN),
    );
    env.add_global("base_stylesheet", BASE_STYLESHEET);
    // Option A: the import map goes before the first module script, and the
    // boot entry is its facade (an import map does not rewrite `<script src>`).
    env.add_global("kp_import_map", crate::shell::assets::kp_map::tag());
    env.add_global("kp_entry", BOOT_ENTRY);
    env.add_global("default_theme", DEFAULT_THEME);
    env.add_global(
        "theme_names",
        themes()
            .iter()
            .map(|t| t.name.as_str())
            .collect::<Vec<_>>()
            .join(","),
    );
    env.add_global("nav", minijinja::Value::from_serialize(kit_nav));
    // kit-kp11: the shell reads each navigation entry's page id from
    // `pages`, entry for entry (with_pages replaces both from the registry).
    env.add_global(
        "pages",
        minijinja::Value::from_serialize(
            kit_nav
                .iter()
                .map(|n| {
                    let id = match n.href.as_str() {
                        "/" => "status",
                        other => other.trim_matches('/'),
                    };
                    serde_json::json!({ "id": id, "title": n.label, "path": n.href, "secondary": false })
                })
                .collect::<Vec<_>>(),
        ),
    );
    // ux-chassis-9: no help until with_pages reads the registry's.
    env.add_global(
        "help_by_path",
        minijinja::Value::from_serialize(std::collections::BTreeMap::<String, String>::new()),
    );
    env.add_global("chassis_version", crate::VERSION);
    env.add_global("kp_themes_version", KP_THEMES_VERSION);
    env.add_global("phone_tabs", PHONE_TABS);
    env.add_global("clients_label", clients_label.to_string());
    env.add_global("vocab", minijinja::Value::from_serialize(vocab));
    env.add_global("token_var", vocab.token_var());
    env.add_global("vocab_article", article_for(&vocab.singular));
    env.add_global(
        "vocab_article_cap",
        capitalise(article_for(&vocab.singular)),
    );
    Ok(env)
}

/// Register every embedded template under the name the handlers render by.
fn add_templates(env: &mut Environment<'static>) -> Result<(), Error> {
    env.add_template(
        "layout.html",
        include_str!("../../../templates/layout.html"),
    )
    .map_err(template_error)?;
    env.add_template("login.html", include_str!("../../../templates/login.html"))
        .map_err(template_error)?;
    env.add_template(
        "status.html",
        include_str!("../../../templates/status.html"),
    )
    .map_err(template_error)?;
    env.add_template(
        "clients.html",
        include_str!("../../../templates/clients.html"),
    )
    .map_err(template_error)?;
    env.add_template(
        "client.html",
        include_str!("../../../templates/client.html"),
    )
    .map_err(template_error)?;
    env.add_template("error.html", include_str!("../../../templates/error.html"))
        .map_err(template_error)?;
    env.add_template(
        "passkeys.html",
        include_str!("../../../templates/passkeys.html"),
    )
    .map_err(template_error)?;
    env.add_template(
        "storage.html",
        include_str!("../../../templates/storage.html"),
    )
    .map_err(template_error)?;
    env.add_template(
        "refresh_slot.html",
        include_str!("../../../templates/refresh_slot.html"),
    )
    .map_err(template_error)?;
    env.add_template(
        "status_notify.html",
        include_str!("../../../templates/status_notify.html"),
    )
    .map_err(template_error)?;
    Ok(())
}
