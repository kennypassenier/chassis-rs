//! The Storage page's JSON API (`/api/kit/storage`): the budget, the files,
//! the kinds of data, a read-only preview, a typed-confirmation delete and a
//! compact. The page itself is drawn from this; a project's own web app can
//! draw its own.
//!
//! Every route sits behind the admin login and the kit's same-origin rule
//! like the other kit POSTs. Cleanup reaches the APP file only, through an
//! [`AppDb`]: the kit file (`<name>-kit.db`) has no kind, no delete and no
//! compact route; a request that names it is a 404 like any unknown kind.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::header::CACHE_CONTROL;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;

use super::app_db::AppDb;
use super::kinds::Selector;
use super::runtime::Storage;
use crate::core::error::{Error, Kind};

fn app(st: &Storage) -> Result<AppDb, Error> {
    st.app().cloned().ok_or_else(|| {
        Error::new(
            Kind::NotFound,
            "this service has no app database to clean up",
            "the Storage page only manages the app's own file (App::app_db); the kit's file is never touched from it",
        )
    })
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, Error> + Send + 'static,
) -> Result<T, Error> {
    tokio::task::spawn_blocking(f).await.unwrap_or_else(|e| {
        Err(Error::internal(
            format!("a storage task failed: {e}"),
            "report this to the project",
        ))
    })
}

fn no_store(body: serde_json::Value) -> Response {
    ([(CACHE_CONTROL, "no-store")], Json(body)).into_response()
}

/// `GET /api/kit/storage`: the budget, both files (WAL included, the kit's
/// marked not cleanable), the reclaimable bytes and one row per kind.
pub(crate) async fn overview(State(st): State<Storage>) -> Result<Response, Error> {
    let body = blocking(move || {
        let report = st.check()?;
        let (kinds, import, reclaimable, last_compacted) = match st.app() {
            Some(app) => (
                app.overview()?,
                serde_json::to_value(app.import_state()).unwrap_or_default(),
                app.sizes()?.reclaimable_bytes,
                app.last_compacted_at()?,
            ),
            None => (Vec::new(), json!({"state": "not_requested"}), 0, None),
        };
        let pct = if report.budget_bytes == 0 {
            0.0
        } else {
            report.total_bytes as f64 * 100.0 / report.budget_bytes as f64
        };
        Ok(json!({
            "budget": {
                "budget_bytes": report.budget_bytes,
                "warn_bytes": report.warn_bytes,
                "total_bytes": report.total_bytes,
                "used_percent": (pct * 10.0).round() / 10.0,
                "level": report.level,
                "checked_at": report.checked_at,
            },
            "files": report.files,
            "reclaimable_bytes": reclaimable,
            "last_compacted_at": last_compacted,
            "has_app_db": st.app().is_some(),
            "paused": crate::shell::backup::is_paused(),
            "import": import,
            "kinds": kinds,
        }))
    })
    .await?;
    Ok(no_store(body))
}

/// `POST /api/kit/storage/{kind}/preview`: nothing is deleted or written.
pub(crate) async fn preview(
    State(st): State<Storage>,
    Path(kind): Path<String>,
    Json(sel): Json<Selector>,
) -> Result<Response, Error> {
    let app = app(&st)?;
    let p = blocking(move || app.preview(&kind, &sel)).await?;
    Ok(no_store(serde_json::to_value(p).unwrap_or_default()))
}

/// The delete: the selector again, the preview's token, and the kind's name.
#[derive(Deserialize)]
pub(crate) struct DeleteBody {
    #[serde(flatten)]
    selector: Selector,
    token: String,
    confirm: String,
}

/// `POST /api/kit/storage/{kind}/delete`.
pub(crate) async fn delete(
    State(st): State<Storage>,
    Path(kind): Path<String>,
    Json(body): Json<DeleteBody>,
) -> Result<Response, Error> {
    let app = app(&st)?;
    let st2 = st.clone();
    let (done, report) = blocking(move || {
        let done = app.delete(&kind, &body.selector, &body.token, &body.confirm)?;
        // After an action the budget is looked at again.
        Ok((done, st2.check()?))
    })
    .await?;
    Ok(no_store(json!({
        "deleted": done,
        "budget": {
            "total_bytes": report.total_bytes,
            "budget_bytes": report.budget_bytes,
            "level": report.level,
        },
    })))
}

/// `POST /api/kit/storage/compact/preview`: what a compact would reclaim.
pub(crate) async fn compact_preview(State(st): State<Storage>) -> Result<Response, Error> {
    let app = app(&st)?;
    let p = blocking(move || app.compact_preview()).await?;
    Ok(no_store(serde_json::to_value(p).unwrap_or_default()))
}

/// `POST /api/kit/storage/compact`: `VACUUM` of the app file only; refused
/// (503 with `Retry-After`) while a backup pause holds the state.
pub(crate) async fn compact(State(st): State<Storage>) -> Result<Response, Error> {
    let app = app(&st)?;
    let st2 = st.clone();
    let (after, report) = blocking(move || {
        let after = app.compact()?;
        Ok((after, st2.check()?))
    })
    .await?;
    Ok(no_store(json!({
        "compacted": after,
        "budget": {
            "total_bytes": report.total_bytes,
            "budget_bytes": report.budget_bytes,
            "level": report.level,
        },
    })))
}

/// The routes, to be layered with the admin login by the caller.
pub(crate) fn routes(st: Storage) -> axum::Router {
    use axum::routing::{get, post};
    axum::Router::new()
        .route("/api/kit/storage", get(overview))
        .route("/api/kit/storage/compact/preview", post(compact_preview))
        .route("/api/kit/storage/compact", post(compact))
        .route("/api/kit/storage/{kind}/preview", post(preview))
        .route("/api/kit/storage/{kind}/delete", post(delete))
        .with_state(st)
}
