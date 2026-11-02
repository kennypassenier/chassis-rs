//! Creating an item on the device under its final id (decision 8).
//!
//! The page makes the key with `crypto.randomUUID()` and POSTs it to the
//! app's list route in the body, with an `Idempotency-Key`. The server
//! must accept a well-formed UUID it does not hold yet and refuse one it
//! holds (409 `exists`) unless the idempotency key is the one the item was
//! created with (the answer to a replay whose first answer was lost).
//!
//! The kit cannot hold the item or the idempotency record: both live in the
//! app's tables, in the app's transaction. These are the rules, as helpers
//! the app calls inside its create route:
//!
//! ```text
//! let id = client_key(&body.id)?;                          // 400 if not a UUID
//! let held = tx.item_idempotency(&id)?;                     // the app's lookup
//! match check_create(held.is_some(), key.get(), held.flatten())? {
//!     CreateVerdict::Create => { /* insert, sync_upsert, record the key */ }
//!     CreateVerdict::Replay => { /* answer with the stored item */ }
//! }
//! ```

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;
use uuid::Uuid;

use crate::core::error::Error;

/// A key the device made: the canonical 36-character UUID (any version, any
/// letter case). Anything else is a 400 in the kit's shape.
pub fn client_key(raw: &str) -> Result<Uuid, Error> {
    let trimmed = raw.trim();
    (trimmed.len() == 36)
        .then(|| Uuid::parse_str(trimmed).ok())
        .flatten()
        .ok_or_else(|| {
            Error::invalid(
                format!("`{raw}` is not a UUID"),
                "create the item with an id made by crypto.randomUUID(), e.g. 3f2b8c1e-5a4d-4e0a-9b1c-2d7e6f8a9b0c",
            )
        })
}

/// What a create route does with a key it was handed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum CreateVerdict {
    /// The key is new: insert the item, record the change.
    Create,
    /// The same request again (same idempotency key): answer with the item
    /// as stored and change nothing.
    Replay,
}

/// 409 `exists`: the key is held by an item this request did not create.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyExists;

impl IntoResponse for KeyExists {
    fn into_response(self) -> Response {
        let body = json!({
            "error": "an item with this id already exists",
            "remedy": "make a new id with crypto.randomUUID() and create the item again",
            "code": "exists",
        });
        (StatusCode::CONFLICT, Json(body)).into_response()
    }
}

/// The create rule. `held`: the app already stores an item under the key.
/// `sent`: the request's `Idempotency-Key`. `recorded`: the idempotency
/// key the stored item was created with, if the app recorded one.
pub fn check_create(
    held: bool,
    sent: Option<Uuid>,
    recorded: Option<Uuid>,
) -> Result<CreateVerdict, KeyExists> {
    match (held, sent, recorded) {
        (false, ..) => Ok(CreateVerdict::Create),
        (true, Some(s), Some(r)) if s == r => Ok(CreateVerdict::Replay),
        (true, ..) => Err(KeyExists),
    }
}
