//! Kit extractors: axum's `Json`, `Query`, `Path` and `Form` whose rejections
//! are the kit's `{error, remedy}` JSON with the status axum chose
//! (400 / 415 / 422), without the layer in [`super::rejections`].
//!
//! Use these in a handler's signature where the answer must be JSON even if
//! the app mounts its router outside the kit's layers, or to be explicit.
//! They deref to the inner value and are used like the originals:
//!
//! ```text
//! async fn list(ApiQuery(q): ApiQuery<ListQuery>) -> Json<Vec<Item>> { .. }
//! ```

use axum::extract::rejection::{FormRejection, JsonRejection, PathRejection, QueryRejection};
use axum::extract::{FromRequest, FromRequestParts, Path, Query, Request};
use axum::http::StatusCode;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use axum::{Form, Json};
use serde::de::DeserializeOwned;

use crate::core::error::Error;

/// The kit's JSON error with an extractor's own status.
fn refusal(status: StatusCode, text: String, remedy: &str) -> Response {
    let mut res = Error::invalid(text, remedy).into_response();
    *res.status_mut() = status;
    res
}

macro_rules! kit_extractor {
    ($(#[$doc:meta])* $name:ident, $inner:ident, $rejection:ident, $remedy:expr, parts) => {
        $(#[$doc])*
        #[derive(Debug, Clone, Copy, Default)]
        pub struct $name<T>(pub T);

        impl<T, S> FromRequestParts<S> for $name<T>
        where
            T: DeserializeOwned + Send,
            S: Send + Sync,
        {
            type Rejection = Response;

            async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Response> {
                match $inner::<T>::from_request_parts(parts, state).await {
                    Ok($inner(v)) => Ok($name(v)),
                    Err(r) => {
                        let r: $rejection = r;
                        Err(refusal(r.status(), r.body_text(), $remedy))
                    }
                }
            }
        }
    };
    ($(#[$doc:meta])* $name:ident, $inner:ident, $rejection:ident, $remedy:expr, body) => {
        $(#[$doc])*
        #[derive(Debug, Clone, Copy, Default)]
        pub struct $name<T>(pub T);

        impl<T, S> FromRequest<S> for $name<T>
        where
            T: DeserializeOwned,
            S: Send + Sync,
        {
            type Rejection = Response;

            async fn from_request(req: Request, state: &S) -> Result<Self, Response> {
                match $inner::<T>::from_request(req, state).await {
                    Ok($inner(v)) => Ok($name(v)),
                    Err(r) => {
                        let r: $rejection = r;
                        Err(refusal(r.status(), r.body_text(), $remedy))
                    }
                }
            }
        }
    };
}

kit_extractor!(
    /// `axum::Json` with the kit's JSON error on a bad or missing body.
    ApiJson, Json, JsonRejection,
    "send valid JSON with the header Content-Type: application/json, matching the endpoint's body",
    body
);
kit_extractor!(
    /// `axum::Form` with the kit's JSON error on a bad form body.
    ApiForm, Form, FormRejection,
    "send the fields the endpoint expects as application/x-www-form-urlencoded",
    body
);
kit_extractor!(
    /// `axum::extract::Query` with the kit's JSON error on a bad query string.
    ApiQuery, Query, QueryRejection,
    "check the query string against the endpoint's parameters: names, types and required fields",
    parts
);
kit_extractor!(
    /// `axum::extract::Path` with the kit's JSON error on a bad path segment.
    ApiPath, Path, PathRejection,
    "check the path segments of the URL against the endpoint's route",
    parts
);
