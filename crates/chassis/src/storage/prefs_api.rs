//! The preferences' HTTP face (3.12.0): `GET /api/kit/prefs?prefix=`,
//! `PUT /api/kit/prefs/{key}` and `DELETE /api/kit/prefs/{key}`, and the
//! injection that puts the values into every signed-in HTML page before the
//! page's own scripts run, so the browser needs no request before first
//! paint.
//!
//! Every route sits behind the admin login and the kit's same-origin rule
//! (the global CSRF guard covers PUT and DELETE like any other POST). The
//! scope is the login identity, see [`login_scope`].

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::header::CACHE_CONTROL;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;

use super::prefs::ADMIN_SCOPE;
use super::prefs_rules::Prefs;
use crate::core::error::Error;
use crate::shell::auth::Caller;

/// The preference scope of a caller: the LOGIN identity, never the device
/// or the passkey. Today the dashboard has one admin (token or passkeys),
/// so every admin session shares [`ADMIN_SCOPE`]; a kit with several users
/// returns the user's id here and nothing else changes, because the store
/// takes the scope as a value.
pub fn login_scope(caller: &Caller) -> String {
    match caller {
        Caller::Admin => ADMIN_SCOPE.to_string(),
        // Not reachable behind require_admin; a client never has preferences.
        _ => String::new(),
    }
}

fn no_store(body: serde_json::Value) -> Response {
    ([(CACHE_CONTROL, "no-store")], Json(body)).into_response()
}

#[derive(Deserialize)]
pub(crate) struct ListQuery {
    #[serde(default)]
    prefix: String,
}

/// `GET /api/kit/prefs?prefix=`: the synced preferences of the login.
pub(crate) async fn list(
    State(p): State<Prefs>,
    caller: Caller,
    Query(q): Query<ListQuery>,
) -> Result<Response, Error> {
    Ok(no_store(
        p.snapshot(&login_scope(&caller), &q.prefix).await?,
    ))
}

#[derive(Deserialize)]
pub(crate) struct PutBody {
    value: String,
}

/// `PUT /api/kit/prefs/{key}` with `{"value": "<string>"}`.
pub(crate) async fn put(
    State(p): State<Prefs>,
    caller: Caller,
    Path(key): Path<String>,
    Json(body): Json<PutBody>,
) -> Result<Response, Error> {
    p.put(&login_scope(&caller), &key, &body.value).await?;
    Ok(no_store(json!({ "key": key, "stored": true })))
}

/// `DELETE /api/kit/prefs/{key}`.
pub(crate) async fn delete(
    State(p): State<Prefs>,
    caller: Caller,
    Path(key): Path<String>,
) -> Result<Response, Error> {
    let existed = p.delete(&login_scope(&caller), &key).await?;
    Ok(no_store(json!({ "key": key, "removed": existed })))
}

/// The routes, to be layered with the admin login by the caller.
pub(crate) fn routes(p: Prefs) -> axum::Router {
    use axum::routing::get;
    axum::Router::new()
        .route("/api/kit/prefs", get(list))
        .route(
            "/api/kit/prefs/{*key}",
            axum::routing::put(put).delete(delete),
        )
        .with_state(p)
}
