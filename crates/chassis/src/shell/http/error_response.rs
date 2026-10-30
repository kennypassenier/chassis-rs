//! How a kit [`Error`] becomes an HTTP response: the status per kind and the
//! JSON body with its remedy. Its own module because it is the one place
//! the error shape (AR4) is defined for the wire.

use axum::response::{IntoResponse, Response};

use crate::core::error::{Error, Kind};

impl IntoResponse for Error {
    /// `{"error": …, "remedy": …}` with the kind's status. Internal errors
    /// keep their remedy but the message is logged, not leaked: the caller
    /// cannot act on a stack of ours, and it may name paths.
    fn into_response(self) -> Response {
        let status = self.kind.status();
        let message = if self.kind == Kind::Internal {
            tracing::error!(error = %self, "internal error");
            "internal error".to_string()
        } else {
            self.message
        };
        let body = serde_json::json!({ "error": message, "remedy": self.remedy });
        // feat-backup-1: a write held past its limit by a backup says when
        // to come back.
        if self.kind == Kind::Overloaded
            && let Some(left) = crate::shell::backup::seconds_left()
        {
            return (
                status,
                [(axum::http::header::RETRY_AFTER, left.to_string())],
                axum::Json(body),
            )
                .into_response();
        }
        (status, axum::Json(body)).into_response()
    }
}
