//! The HTTP face (decisions 2 and 10): `GET /api/sync` and
//! `GET /api/sync/<collection>?since=&limit=`.
//!
//! Both sit behind the admin login and answer `Cache-Control: no-store`, so
//! the worker never caches them. The scope is the login's
//! ([`login_scope`]). A cursor older than the floor answers **410** in the
//! kit's error shape with `code: "resync"`.

use axum::Json;
use axum::Router;
use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::CACHE_CONTROL;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use serde::Deserialize;
use serde_json::{Value, json};

use super::feed::Feed;
use super::service::SyncService;
use crate::core::error::Error;
use crate::shell::auth::Caller;
use crate::shell::http::extractors::{ApiPath, ApiQuery};
use crate::storage::prefs_api::login_scope;

#[derive(Deserialize)]
struct FeedQuery {
    since: Option<String>,
    limit: Option<usize>,
}

fn no_store(status: StatusCode, body: Value) -> Response {
    (status, [(CACHE_CONTROL, "no-store")], Json(body)).into_response()
}

async fn manifest(State(s): State<SyncService>) -> Response {
    no_store(StatusCode::OK, s.manifest())
}

async fn feed(
    State(s): State<SyncService>,
    caller: Caller,
    ApiPath(collection): ApiPath<String>,
    ApiQuery(q): ApiQuery<FeedQuery>,
) -> Result<Response, Error> {
    let scope = login_scope(&caller);
    let page = s
        .feed(&collection, &scope, q.since.as_deref(), q.limit)
        .await?;
    Ok(match page {
        Feed::Page(p) => no_store(StatusCode::OK, p.to_json()),
        Feed::Resync { .. } => no_store(
            StatusCode::GONE,
            json!({
                "error": "this device has been away longer than the server remembers deletions",
                "remedy": "start over: read the collection from the beginning, without `since`",
                "code": "resync",
            }),
        ),
    })
}

/// The routes, to be layered with the admin login by the caller.
pub(crate) fn routes(service: SyncService) -> Router {
    Router::new()
        .route("/api/sync", get(manifest))
        .route("/api/sync/{collection}", get(feed))
        .with_state(service)
}
