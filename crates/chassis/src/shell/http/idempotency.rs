//! `Idempotency-Key` on an app's POST routes (feat-offline-post-1). Opt-in.
//!
//! The offline client sends a UUID in this header with every POST it queues
//! and keeps it across replays, so a request that reached the server but whose
//! answer was lost is not applied twice. The kit provides the extractor only
//! (validated, 400 in the kit's shape when malformed). It deliberately has no
//! store: "answer a repeated key with the first result" is only exact when the
//! key is recorded in the same transaction as the write, which only the app's
//! own database can do.
//!
//! ```text
//! async fn take_one(State(db): State<Db>, key: IdempotencyKey, ...) -> Result<Json<Stock>, Error> {
//!     let mut tx = db.begin()?;
//!     if let Some(key) = key.get() {
//!         if let Some(first) = tx.answer_for(key)? { return Ok(Json(first)); }   // repeat
//!     }
//!     let stock = tx.take_one(id)?;
//!     if let Some(key) = key.get() { tx.record(key, &stock)?; }                  // same transaction
//!     tx.commit()?;
//!     Ok(Json(stock))
//! }
//! ```

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::core::error::Error;

/// The request's `Idempotency-Key`, a UUID. Absent is `IdempotencyKey(None)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IdempotencyKey(Option<Uuid>);

impl IdempotencyKey {
    /// The key, if the request carried one.
    pub fn get(&self) -> Option<Uuid> {
        self.0
    }
}

impl<S: Send + Sync> FromRequestParts<S> for IdempotencyKey {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Response> {
        let Some(raw) = parts.headers.get("idempotency-key") else {
            return Ok(Self(None));
        };
        raw.to_str()
            .ok()
            .and_then(|text| Uuid::parse_str(text.trim()).ok())
            .map(|key| Self(Some(key)))
            .ok_or_else(|| {
                Error::invalid(
                    "Idempotency-Key is not a UUID",
                    "send a UUID such as 3f2b8c1e-5a4d-4e0a-9b1c-2d7e6f8a9b0c, or no key",
                )
                .into_response()
            })
    }
}
