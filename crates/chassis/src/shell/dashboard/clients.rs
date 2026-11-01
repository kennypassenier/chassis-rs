//! The clients page: the rows and counts it and `/api/kit/clients` share, and
//! the page and JSON answers. Its own module because it is the one place that
//! turns the client store, the project's columns and form fields and the
//! standing rules into the document the clients template draws.

use super::*;
use crate::core::error::Kind;

#[derive(Serialize)]
struct ClientRow {
    #[serde(flatten)]
    view: ClientView,
    /// feat-clients-2: one cell per field the project declared, in the
    /// order it declared them, escaped.
    declared: Vec<String>,
    extra: Vec<String>,
    /// K29: the project's buttons, routes with this client's id filled in.
    /// Empty on a revoked row — an action on a client that no longer has a
    /// token has nothing to act on.
    actions: Vec<serde_json::Value>,
    /// kit-kp11: `in use`, `idle`, `new` or `revoked` (client_list).
    state: client_list::Standing,
    /// Days without a call; 0 unless `state` is `idle`.
    idle_days: i64,
    /// dd/mm/yyyy HH:mm, Europe/Brussels.
    issued_display: String,
    /// dd/mm/yyyy.
    issued_date: String,
    last_used_display: Option<String>,
    /// `12 s ago`, `5 days ago`.
    last_used_ago: Option<String>,
    revoked_display: Option<String>,
    /// dd/mm/yyyy.
    revoked_date: Option<String>,
}

/// `GET /clients` — the clients page (K12, K13, K14).
pub(super) fn page(d: &Dashboard) -> Result<Html<String>, Error> {
    let data = clients_data(d);
    d.render(
        "clients.html",
        context! {
            logged_in => true,
            idle_clients => d.idle_clients(),
            active_nav => "/clients",
            ..minijinja::Value::from_serialize(&data)
        },
    )
}

/// `GET /clients/{id}` — the page of one client: its token, the command, the
/// test, the request log and the danger zone (ux-chassis-5). It is drawn from
/// the same rows as the list, so the two never disagree; an id that names no
/// client is a 404 in the project's words.
pub(super) fn detail(d: &Dashboard, id: &str) -> Result<Html<String>, Error> {
    let mut data = clients_data(d);
    let row = data["clients"]
        .as_array()
        .and_then(|rows| rows.iter().find(|r| r["id"] == id))
        .cloned()
        .ok_or_else(|| {
            Error::new(
                Kind::NotFound,
                format!("there is no {} at this address", d.vocab.singular),
                format!(
                    "open the {} list and pick one; it may have been deleted",
                    d.vocab.singular
                ),
            )
        })?;
    // The list's rows are not the detail page's business.
    if let Some(map) = data.as_object_mut() {
        map.remove("clients");
    }
    d.render(
        "client.html",
        context! {
            logged_in => true,
            idle_clients => d.idle_clients(),
            active_nav => "/clients",
            c => row,
            ..minijinja::Value::from_serialize(&data)
        },
    )
}

/// feat-pages-1: `GET /api/kit/clients`, what the clients page shows.
pub(super) fn json(d: &Dashboard) -> Response {
    (
        [(axum::http::header::CACHE_CONTROL, "no-cache")],
        axum::Json(clients_data(d)),
    )
        .into_response()
}

/// The distinct, filled-in values of one declared field, in the order given.
pub(super) fn usual_values<'a>(values: impl Iterator<Item = &'a str>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for v in values {
        if !v.is_empty() && v != "—" && !out.iter().any(|o| o == v) {
            out.push(v.to_string());
        }
    }
    out
}

/// The path a client calls (`/v1/messages`): the last word of the curl line in
/// `command_template`, without its scheme and host.
pub(super) fn calls_path(template: &str) -> String {
    let url = template.split_whitespace().last().unwrap_or("");
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    rest.find('/')
        .map_or_else(|| "/".to_string(), |i| rest[i..].to_string())
}

/// One client as the table draws it: the store's view plus the standing,
/// the project's declared-field cells and columns, and its action buttons.
fn client_row(
    d: &Dashboard,
    c: &crate::core::clients::Client,
    now: chrono::DateTime<chrono::Utc>,
) -> ClientRow {
    let view = ClientView::from(c);
    let (state, idle_days) = client_list::standing(&view, now);
    // feat-clients-2: one cell per declared field, before the
    // project's own columns. The project declared the field, so the
    // kit shows it back without being asked. The template renders
    // these WITHOUT `|safe`: the value came from a form, unlike a
    // project column's cell, which is HTML the project vouches for.
    let declared: Vec<String> = d
        .form_fields
        .iter()
        .map(|f| {
            view.fields
                .get(&f.name)
                .cloned()
                .unwrap_or_else(|| "—".to_string())
        })
        .collect();
    let extra = d.columns.iter().map(|col| col.cell(&view)).collect();
    let actions = if view.active {
        d.client_actions
            .iter()
            .map(|a| a.view(Some(&view.id)))
            .collect()
    } else {
        Vec::new()
    };
    ClientRow {
        issued_display: client_list::brussels(&view.issued_at),
        issued_date: client_list::brussels_date(&view.issued_at),
        last_used_display: view.last_used_at.as_deref().map(client_list::brussels),
        last_used_ago: view
            .last_used_at
            .as_deref()
            .map(|t| client_list::ago_words(t, now)),
        revoked_display: view.revoked_at.as_deref().map(client_list::brussels),
        revoked_date: view.revoked_at.as_deref().map(client_list::brussels_date),
        state,
        idle_days,
        view,
        declared,
        extra,
        actions,
    }
}

/// The project's extra columns, each marked numeric only when every cell in
/// it is a number (so it sorts as one).
fn extra_columns(d: &Dashboard, rows: &[ClientRow]) -> Vec<serde_json::Value> {
    d.columns
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let numeric = !rows.is_empty()
                && rows.iter().all(|r| {
                    r.extra
                        .get(i)
                        .is_some_and(|cell| cell.trim().parse::<f64>().is_ok())
                });
            serde_json::json!({ "title": c.title(), "numeric": numeric })
        })
        .collect()
}

pub(super) fn clients_data(d: &Dashboard) -> serde_json::Value {
    let snap = d.clients.snapshot();
    let now = chrono::Utc::now();
    let rows: Vec<ClientRow> = snap.clients.iter().map(|c| client_row(d, c, now)).collect();
    let counts = client_list::counts(rows.iter().map(|r| (r.state, &r.view)));
    // A project column sorts as a number only when every cell is one.
    let columns = extra_columns(d, &rows);
    // kit-kp11 (clients-issue): the values each declared field already holds,
    // most recent first, for the "used before" list of its combobox.
    let form_usual: Vec<Vec<String>> = (0..d.form_fields.len())
        .map(|i| usual_values(rows.iter().rev().map(|r| r.declared[i].as_str())))
        .collect();
    serde_json::json!({
        "counts": counts,
        "idle_after_days": client_list::IDLE_AFTER_DAYS,
        "command_template": &*d.command_template,
        "token_var": d.vocab.token_var(),
        "calls_path": calls_path(&d.command_template),
        "form_usual": form_usual,
        "clients": rows,
        "declared_columns": d
            .form_fields
            .iter()
            .map(|f| serde_json::json!({ "title": f.label.clone() }))
            .collect::<Vec<_>>(),
        "extra_columns": columns,
        "form_fields": d.form_fields.iter().map(|f| f.view()).collect::<Vec<_>>(),
        "reveal_seconds": d.reveal_seconds,
        "capture_body_bytes": d.capture_body_bytes,
        "capture_ttl_minutes": d.capture_ttl_minutes,
        "has_test_route": d.has_test_route,
        "test_body": &*d.test_body,
        "test_json": d.test_json,
    })
}
