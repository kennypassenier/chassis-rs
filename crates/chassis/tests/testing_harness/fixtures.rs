//! Shared setup for the testing harness tests: app spec and a whoami route.

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::routing::get;
use chassis::{AppSpec, Caller};

/// What the issue hook recorded: the client's name and its `calendar` field.
pub type SeenIssue = Arc<Mutex<Option<(String, Option<String>)>>>;

pub fn spec(name: &'static str) -> AppSpec {
    AppSpec {
        name,
        version: "1.2.3",
        ..Default::default()
    }
}

/// An API route that says who called it, so a test can tell a client
/// token from the admin's.
pub fn whoami() -> Router {
    Router::new().route(
        "/v1/whoami",
        get(|caller: Caller| async move {
            match caller {
                Caller::Admin => "admin".to_string(),
                Caller::Client { name, .. } => name,
            }
        }),
    )
}
