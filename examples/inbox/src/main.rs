//! inbox — the example service that proves the kit (K26).
//!
//! L3: clients post JSON messages with their token; the kit supplies
//! login, clients, tokens and the last-requests view. The dashboard page
//! that lists the messages arrives in L4/L7.

#![forbid(unsafe_code)]

use std::sync::{Arc, Mutex};

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use chassis::{App, AppSpec, Caller};

/// Messages received so far, newest last. In memory: the example proves
/// the kit, not a database.
type Messages = Arc<Mutex<Vec<serde_json::Value>>>;

async fn receive(
    State(messages): State<Messages>,
    caller: Caller,
    Json(body): Json<serde_json::Value>,
) -> (axum::http::StatusCode, Json<serde_json::Value>) {
    let from = match &caller {
        Caller::Client { name, .. } => name.clone(),
        Caller::Admin => "admin".to_string(),
    };
    let mut all = messages.lock().expect("messages lock");
    all.push(serde_json::json!({ "from": from, "body": body }));
    let id = all.len();
    (
        axum::http::StatusCode::ACCEPTED,
        Json(serde_json::json!({ "id": id, "from": from })),
    )
}

#[tokio::main]
async fn main() -> std::process::ExitCode {
    let spec = AppSpec {
        name: "inbox",
        version: env!("CARGO_PKG_VERSION"),
        ..Default::default()
    };
    let messages: Messages = Arc::new(Mutex::new(Vec::new()));
    // No public routes: `/` is the kit's status page, `/v1/messages` needs a token.
    let mut app = match App::from_env_and_args(spec, Router::new()) {
        Ok(app) => app,
        Err(e) => {
            eprintln!("{e}");
            return std::process::ExitCode::FAILURE;
        }
    };
    app.api_routes(
        Router::new()
            .route("/v1/messages", post(receive))
            .with_state(messages),
    );
    app.test_route(
        "POST",
        "/v1/messages",
        "application/json",
        r#"{"hello":"from the dashboard"}"#,
    );
    app.run().await
}
