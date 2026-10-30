//! The status page: the data it and `/api/kit/status` share, the page and
//! JSON answers, and the "Check for updates" button's answer. Its own module
//! because it is the one place that gathers sections, health, update and
//! uptime into the document the status template draws.

use super::*;

/// A `Section` as the template sees it: the project's fields plus its
/// actions (K29). Kept apart from `Section` because projects build that
/// one as a struct literal, so a new field there would break them.
#[derive(Serialize)]
struct SectionView {
    #[serde(flatten)]
    section: Section,
    actions: Vec<serde_json::Value>,
    /// kit-kp11: the body as data, when the section declares one.
    body: Option<SectionBody>,
    flash_actions: Vec<serde_json::Value>,
    /// The bodies the card draws, each as `{kind, data, sorts?}`.
    parts: Vec<serde_json::Value>,
    /// A readable id for the card, unique on the page.
    slug: String,
    /// Columns of twelve the card takes (see `sections::pack_spans`).
    span: u8,
}

/// `GET /` — the status page (K17).
pub(super) async fn page(d: &Dashboard) -> Result<Html<String>, Error> {
    let data = status_data(d).await;
    d.render(
        "status.html",
        context! {
            logged_in => true,
            idle_clients => d.idle_clients(),
            notify_card => d.notify_card,
            active_nav => "/status",
            ..minijinja::Value::from_serialize(&data)
        },
    )
}

/// feat-pages-1: `GET /api/kit/status`, what the status page shows, for a
/// web app that draws the page itself.
pub(super) async fn json(d: &Dashboard) -> Response {
    (
        [(axum::http::header::CACHE_CONTROL, "no-cache")],
        axum::Json(status_data(d).await),
    )
        .into_response()
}

/// kit-kp11: `POST /api/kit/status/update-check`, one read-only look at the
/// release host for the status page's "Check for updates" button. Answers
/// what the card would now say.
pub(super) async fn update_check(d: &Dashboard) -> Response {
    let Some(check) = d.check_update.clone() else {
        return Error::config(
            "this service has no release host to check",
            "set update_url (or AppSpec.repository) and restart to look for new releases",
        )
        .into_response();
    };
    if let Err(e) = check().await {
        return e.into_response();
    }
    let facts = sections::update_facts(d.version, &(d.update)(), true);
    (
        [(axum::http::header::CACHE_CONTROL, "no-store")],
        axum::Json(serde_json::json!({
            "running": d.version,
            "latest": facts.latest,
            "newer": facts.newer,
            "last_check_at": facts.last_check_at,
        })),
    )
        .into_response()
}

/// Every section rendered for the template: its rows, actions, body parts,
/// slug and the columns of twelve its card takes.
fn section_views(d: &Dashboard) -> Vec<SectionView> {
    let rendered: Vec<Section> = d.sections.iter().map(|s| s.render()).collect();
    let bodies: Vec<Option<SectionBody>> = d.sections.iter().map(|s| s.body()).collect();
    let spans = sections::pack_spans(&bodies.iter().map(Option::as_ref).collect::<Vec<_>>());
    d.sections
        .iter()
        .zip(rendered)
        .zip(bodies)
        .zip(spans)
        .enumerate()
        .map(|(i, (((s, section), body), span))| SectionView {
            slug: sections::slug(&section.title, i),
            section,
            actions: s.actions().iter().map(|a| a.view(None)).collect(),
            parts: body
                .as_ref()
                .map(|b| {
                    b.parts()
                        .into_iter()
                        .map(|p| {
                            let mut v = serde_json::to_value(p).unwrap_or_default();
                            v["sorts"] = serde_json::json!(p.column_sorts());
                            v
                        })
                        .collect()
                })
                .unwrap_or_default(),
            body,
            flash_actions: s.flash_actions().iter().map(FlashAction::view).collect(),
            span,
        })
        .collect()
}

/// Seconds since the service started, 0 when the start time does not parse.
fn seconds_up(started_at: &str) -> u64 {
    chrono::DateTime::parse_from_rfc3339(started_at)
        .map(|t| {
            (chrono::Utc::now() - t.with_timezone(&chrono::Utc))
                .num_seconds()
                .max(0) as u64
        })
        .unwrap_or(0)
}

async fn status_data(d: &Dashboard) -> serde_json::Value {
    let health = d.sample_health().await;
    let sections = section_views(d);
    let declared: Vec<SectionAssets> = d.sections.iter().map(|s| s.assets()).collect();
    let section_assets = merge_section_assets(&declared);
    let problems = sections::problem_views((d.problems)());
    let update = (d.update)();
    let update_facts = sections::update_facts(d.version, &update, d.check_update.is_some());
    let paused = crate::shell::backup::status_view();
    let snap = d.clients.snapshot();
    let parts = health.subsystems.as_object().map_or(0, |m| m.len());
    let failing = health
        .subsystems
        .as_object()
        .map_or(0, |m| m.values().filter(|v| v["ok"] == false).count());
    let up_secs = seconds_up(&d.started_at);
    serde_json::json!({
        "version": d.version,
        "listen": d.listen,
        "started_at": d.started_at,
        "up_for": sections::span_words(up_secs),
        "health": health,
        "parts": { "total": parts, "failing": failing },
        "sections": sections,
        "section_assets": section_assets,
        "problems": problems,
        "update": update,
        "update_facts": update_facts,
        "backup": paused,
        "uptime": d.uptime.periods(),
        "repository_url": d.repository_url,
        "clients": d.clients_href.as_ref().map(|href| serde_json::json!({
            "href": href,
            "label": d.vocab.plural_cap,
            "active": snap.clients.iter().filter(|c| c.revoked_at.is_none()).count(),
            "total": snap.clients.len(),
        })),
    })
}
