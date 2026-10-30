//! The `Dashboard` the kit's pages render through, with the status page's
//! problem list, the update line and the page set every navigation draws
//! from.

use std::sync::Arc;

use super::clients_state::Hints;
use super::{Ctx, MountExtra, passkeys_wanted};
use crate::app::DashboardRegistry;
use crate::shell::auth::AuthState;
use crate::shell::dashboard::{Dashboard, Problem, UpdateView, Vocabulary};
use crate::shell::pages::PageSet;
use crate::shell::store::ClientStore;

/// The dashboard and what the routers need next to it.
pub(super) struct Built {
    pub(super) dash: Dashboard,
    pub(super) page_set: Arc<PageSet>,
    pub(super) vocab: Vocabulary,
    pub(super) vocab_article: Arc<str>,
}

/// Build the dashboard from the project's registry, the clients API hints
/// and the pages the project declared. Consumes the registry.
pub(super) fn build(
    ctx: &Ctx,
    extra: &mut MountExtra,
    registry: DashboardRegistry,
    hints: Hints,
    clients: Arc<dyn ClientStore>,
    auth: &AuthState,
) -> Result<Built, crate::core::error::Error> {
    let spec = ctx.spec;
    let loaded = ctx.loaded;
    let limits = ctx.limits;
    let prefix = &ctx.prefix;
    let guards = &ctx.guards;
    let addr = ctx.addr;
    let open = ctx.open;
    let kit_guards = guards.clone();
    let project_problems = registry.problems.unwrap_or_else(|| Arc::new(Vec::new));
    #[cfg(feature = "storage")]
    let storage_for_problems = extra.storage.clone();
    let problems: Arc<dyn Fn() -> Vec<Problem> + Send + Sync> = Arc::new(move || {
        let mut v = project_problems();
        #[cfg(feature = "storage")]
        if let Some(st) = &storage_for_problems {
            v.extend(st.problems().into_iter().map(|p| Problem {
                what: p.what,
                why: p.why,
                remedy: p.remedy,
            }));
        }
        v.extend(kit_guards.problems().into_iter().map(|p| Problem {
            what: p.what,
            why: p.why,
            remedy: p.remedy,
        }));
        v
    });
    let update = registry
        .update
        .unwrap_or_else(|| Arc::new(UpdateView::default));
    // K28: an explicit label wins; otherwise the page is named after the
    // vocabulary ("Sources"), which is "Clients" by default.
    let vocab = registry.vocabulary.unwrap_or_default();
    // kit-r4: "a"/"an" by the word's sound unless the service overrides it.
    let vocab_article: Arc<str> = registry
        .vocabulary_article
        .filter(|a| !a.is_empty())
        .map(Arc::from)
        .unwrap_or_else(|| Arc::from(crate::shell::dashboard::article_for(&vocab.singular)));
    let clients_label = registry
        .clients_label
        .or_else(|| Some(vocab.plural_cap.clone()));
    let dash = Dashboard::new(
        spec.name,
        spec.version,
        prefix.clone(),
        addr.to_string(),
        clients_label,
        crate::shell::time::reveal_seconds(loaded),
        limits.capture_body_bytes,
        limits.capture_ttl.as_secs() / 60,
        limits.remember_me_secs / 86_400,
        hints.has_test_route,
        passkeys_wanted(open, &extra.disabled),
        limits.public_url.clone().unwrap_or_default(),
        registry.nav.clone(),
        registry.sections,
        registry.columns,
        registry.form_fields,
        problems,
        update,
        ctx.health.clone(),
        clients,
        auth.clone(),
        open,
    )?
    .with_vocabulary(vocab.clone())
    .with_vocabulary_article(&vocab_article)
    .with_client_actions(registry.client_actions)
    .with_update_check(registry.check_update)
    .with_repository(spec.repository)
    .with_command_template(hints.command_template)
    .with_test_body(hints.test_body.0, &hints.test_body.1);

    // feat-pages-1: one list of pages for every navigation. `nav_entry`
    // links from before 3.1.0 join it as visible project pages.
    let mut app_pages = std::mem::take(&mut extra.pages);
    for (i, n) in registry.nav.iter().enumerate() {
        app_pages.push(crate::shell::pages::Page::new(
            &format!("nav-{i}"),
            &n.label,
            &n.href,
        ));
    }
    let page_set = Arc::new(
        crate::shell::pages::Registry {
            app_pages,
            kit_edits: std::mem::take(&mut extra.kit_edits),
            disabled: extra.disabled.clone(),
            brand: extra.brand.take(),
            brand_title: extra.brand_title.take(),
            home: extra.home.take(),
        }
        .build(
            spec.name,
            &dash.clients_label,
            dash.passkeys_enabled,
            cfg!(feature = "storage") && !extra.disabled.iter().any(|d| d == "storage"),
            extra.webapp_at_root,
            extra.kit_in_webapp,
        ),
    );
    #[cfg(feature = "notify")]
    let dash = dash
        .with_notify_card(extra.notify.is_some() && !extra.disabled.iter().any(|d| d == "status"));
    let dash = dash
        .with_pages(&page_set)
        .with_pwa_head(extra.pwa_head.take());
    dash.spawn_uptime_sampler();
    Ok(Built {
        dash,
        page_set,
        vocab,
        vocab_article,
    })
}
