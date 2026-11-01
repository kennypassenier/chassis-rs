//! The page's door to push: `GET /api/kit/push/key`,
//! `POST /api/kit/push/subscribe` and `POST /api/kit/push/unsubscribe`.
//! Layered with the admin login by the mount; the kit's global same-origin
//! rule covers the POSTs like any other (see `docs/PUSH_DESIGN.md`).

use axum::Json;
use axum::Router;
use axum::extract::State;
use axum::http::header::CACHE_CONTROL;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use serde_json::{Value, json};

use super::b64;
use super::sender::blocking;
use super::subscription::{SubscribeBody, UnsubscribeBody};
use crate::core::error::Error;
use crate::shell::time::now_epoch;
use crate::storage::push_store::{PushStore, Upsert};

/// What the handlers share.
#[derive(Clone)]
pub(crate) struct PushState {
    pub store: PushStore,
    /// The VAPID public key, base64url: what `applicationServerKey` wants.
    pub public_key: String,
}

fn no_store(body: Value) -> Response {
    ([(CACHE_CONTROL, "no-store")], Json(body)).into_response()
}

/// `GET /api/kit/push/key`: the public key to subscribe with.
async fn public_key(State(st): State<PushState>) -> Response {
    no_store(json!({ "public_key": st.public_key }))
}

/// `POST /api/kit/push/subscribe` with `PushSubscription.toJSON()`.
async fn subscribe(
    State(st): State<PushState>,
    Json(body): Json<SubscribeBody>,
) -> Result<Response, Error> {
    let checked = body.check()?;
    let store = st.store.clone();
    let (created, count) = blocking(move || {
        let outcome = store.upsert(
            &checked.endpoint,
            &checked.p256dh,
            &checked.auth,
            now_epoch() as i64,
        )?;
        Ok((outcome == Upsert::Created, store.all()?.len()))
    })
    .await?;
    tracing::info!(audit = true, created, count, "push: a browser subscribed");
    Ok(no_store(
        json!({ "subscribed": true, "created": created, "count": count }),
    ))
}

/// `POST /api/kit/push/unsubscribe` with `{endpoint}`.
async fn unsubscribe(
    State(st): State<PushState>,
    Json(body): Json<UnsubscribeBody>,
) -> Result<Response, Error> {
    let store = st.store.clone();
    let removed = blocking(move || store.remove(&body.endpoint)).await?;
    tracing::info!(audit = true, removed, "push: a browser unsubscribed");
    Ok(no_store(json!({ "removed": removed })))
}

/// The routes, to be layered with the admin login by the caller.
pub(crate) fn routes(state: PushState) -> Router {
    Router::new()
        .route("/api/kit/push/key", get(public_key))
        .route("/api/kit/push/subscribe", post(subscribe))
        .route("/api/kit/push/unsubscribe", post(unsubscribe))
        .with_state(state)
}

/// The VAPID public key as the API serves it.
pub(crate) fn encode_public_key(key: &[u8]) -> String {
    b64::encode(key)
}
