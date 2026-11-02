//! `If-Match`, `ETag` and the 409 on an app's data routes (feat-offline-1).
//! Opt-in: nothing happens to a route that does not use these types.
//!
//! ```text
//! async fn put_dish(State(s): State<Store>, Path(id): Path<String>,
//!                   if_match: IfMatch, ApiJson(dish): ApiJson<Dish>)
//!     -> Result<Revisioned<Dish>, Conflict>
//! {
//!     if_match.check(s.rev(&id))?;               // 409 {error, remedy, code, rev}
//!     let rev = s.replace(&id, &dish);
//!     Ok(Revisioned::new(rev, dish))              // ETag: "<rev>"
//! }
//! ```
//!
//! The answer to a refused write is the kit's `{error, remedy}` with
//! `code: "stale"`, `rev` (the stored revision) and, when the handler adds it,
//! `current` (the stored item), so a client can show or merge it.

use axum::Json;
use axum::extract::FromRequestParts;
use axum::http::header::{ETAG, IF_MATCH};
use axum::http::request::Parts;
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use serde_json::{Value, json};

use crate::core::error::Error;
use crate::core::revision::{Precondition, Stale, etag};

/// The request's `If-Match`, parsed. Absent is `IfMatch(None)`: no check.
/// A header that is not a revision answers 400 in the kit's shape.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IfMatch(Option<Precondition>);

impl IfMatch {
    /// What the header asked for, if it was sent.
    pub fn precondition(&self) -> Option<Precondition> {
        self.0
    }

    /// `Ok` when the write may go ahead on an item stored at `current`
    /// (absent counts as 0), else the 409 to return.
    pub fn check(&self, current: u64) -> Result<(), Conflict> {
        crate::core::revision::check(self.0, current).map_err(Conflict::from)
    }
}

impl<S: Send + Sync> FromRequestParts<S> for IfMatch {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Response> {
        let Some(raw) = parts.headers.get(IF_MATCH) else {
            return Ok(Self(None));
        };
        let parsed = raw
            .to_str()
            .map_err(|_| {
                Error::invalid(
                    "If-Match is not text",
                    "send the revision as a plain number",
                )
            })
            .and_then(Precondition::parse);
        parsed
            .map(|p| Self(Some(p)))
            .map_err(IntoResponse::into_response)
    }
}

/// 409: the item was saved since the request read it.
#[derive(Debug, Clone, PartialEq)]
pub struct Conflict {
    current_rev: u64,
    item: Option<Value>,
}

impl Conflict {
    /// Send the stored item along, so the client can show or merge it.
    #[must_use]
    pub fn with_item(mut self, item: impl Serialize) -> Self {
        self.item = serde_json::to_value(item).ok();
        self
    }
}

impl From<Stale> for Conflict {
    fn from(stale: Stale) -> Self {
        Self {
            current_rev: stale.current,
            item: None,
        }
    }
}

impl IntoResponse for Conflict {
    fn into_response(self) -> Response {
        let mut body = json!({
            "error": "this item was changed since you read it",
            "remedy": "reload the item to see the saved version, then save your change again",
            "code": "stale",
            "rev": self.current_rev,
        });
        if let Some(item) = self.item {
            body["current"] = item;
        }
        let mut res = (StatusCode::CONFLICT, Json(body)).into_response();
        set_etag(&mut res, self.current_rev);
        res
    }
}

/// A JSON answer carrying the item's revision as `ETag: "<rev>"` (status 200).
/// The revision is not added to the body: put it there if clients should
/// read it from the item (the offline client reads either).
#[derive(Debug, Clone)]
pub struct Revisioned<T> {
    rev: u64,
    body: T,
}

impl<T> Revisioned<T> {
    pub fn new(rev: u64, body: T) -> Self {
        Self { rev, body }
    }
}

impl<T: Serialize> IntoResponse for Revisioned<T> {
    fn into_response(self) -> Response {
        let mut res = Json(self.body).into_response();
        set_etag(&mut res, self.rev);
        res
    }
}

fn set_etag(res: &mut Response, rev: u64) {
    if let Ok(value) = HeaderValue::from_str(&etag(rev)) {
        res.headers_mut().insert(ETAG, value);
    }
}
