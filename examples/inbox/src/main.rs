//! inbox — the example service that proves the kit (K26).
//!
//! Clients post JSON messages with their token; the kit supplies login,
//! clients, tokens, the last-requests view, self-update and notifications.
//! Each received message is a project event (`message.received`), so a
//! configured webhook hears about it. The dashboard page that lists the
//! messages is assembled in L7.
//!
//! The parts: `state` (the message list the handlers share), `handlers` (the
//! intake and the admin routes), `sections` (the dashboard additions) and
//! `storage` (the example tables). This file wires them to the kit.

#![forbid(unsafe_code)]

mod handlers;
mod sections;
mod state;
mod storage;

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::routing::{get, post};
use chassis::shell::dashboard::ClientFormField;
use chassis::shell::metrics::{Counter, Gauge};
use chassis::{App, AppSpec};

use handlers::{clear_messages, count_messages, messages_page, receive};
use sections::{IntakeSection, LatestSection, MessagesColumn, MessagesSection, StoreSection};
use state::{Inbox, Messages};

#[tokio::main]
async fn main() -> std::process::ExitCode {
    let spec = AppSpec {
        name: "inbox",
        version: env!("CARGO_PKG_VERSION"),
        // Releases of the example live with the kit; set update_url to
        // point somewhere else (a drill server, for instance).
        repository: Some("kennypassenier/chassis-rs"),
        ..Default::default()
    };
    // feat-metrics-1: the project's own series carry the kit's prefix, so
    // `inbox_messages_received_total` sits beside the kit's own
    // `inbox_http_requests_total` in one scrape. Read before the spec moves.
    let prefix = spec.metric_prefix();
    // No public routes: `/` is the kit's status page, `/v1/messages` needs a token.
    let mut app = match App::from_env_and_args(spec, Router::new()) {
        Ok(app) => app,
        Err(e) => {
            eprintln!("{e}");
            return std::process::ExitCode::FAILURE;
        }
    };
    let messages: Messages = Arc::new(Mutex::new(Vec::new()));
    let (received, stored) = register_metrics(&mut app, &prefix);
    let inbox = Inbox {
        messages: messages.clone(),
        notifier: app.notifier(),
        received: received.clone(),
        stored: stored.clone(),
    };
    app.api_routes(
        Router::new()
            .route("/v1/messages", post(receive))
            .with_state(inbox),
    );
    app.test_route(
        "POST",
        "/v1/messages",
        "application/json",
        r#"{"hello":"from the dashboard"}"#,
    );
    storage::declare(&mut app);
    register_dashboard_parts(&mut app, &messages);
    register_client_fields(&mut app);
    register_pages(&mut app, &messages, &stored);
    register_state_copy(&mut app, messages);
    app.run().await
}

/// The project's two series, registered with the kit's `/metrics`: a counter
/// for what happened and a gauge for what is.
fn register_metrics(app: &mut App, prefix: &str) -> (Counter, Gauge) {
    let received = Counter::new(
        prefix,
        "messages_received_total",
        "Messages accepted on /v1/messages since start",
    );
    let stored = Gauge::new(
        prefix,
        "messages_stored",
        "Messages held in memory right now",
    );
    app.metrics_source(received.clone());
    app.metrics_source(stored.clone());
    (received, stored)
}

/// The status sections and the clients column, all reading the message list.
fn register_dashboard_parts(app: &mut App, messages: &Messages) {
    app.status_section(MessagesSection(messages.clone()));
    app.status_section(LatestSection(messages.clone()));
    app.status_section(IntakeSection(messages.clone()));
    app.status_section(StoreSection);
    app.client_column(MessagesColumn(messages.clone()));
}

/// What a client of THIS service needs besides a name, and the hook that may refuse it.
fn register_client_fields(app: &mut App) {
    // feat-clients-2: what a client of THIS service needs besides a name.
    // The kit stores it with the client, renders it as a column under this
    // label, and returns it from the clients API — the project writes no
    // storage of its own for it.
    app.client_form_field(ClientFormField::text("topic", "Topic", "alerts"));
    // The same hook may refuse: an empty topic would make the column
    // useless, and a refusal reaches the page as the kit's error with its
    // remedy rather than as a silent blank.
    app.on_client_issued(|client, fields| {
        let topic = fields.get("topic").map(String::as_str).unwrap_or("").trim();
        if topic.is_empty() {
            return Err(chassis::Error::invalid(
                format!("{} needs a topic", client.name),
                "fill in the topic field — it is what this client's messages are about",
            ));
        }
        Ok(())
    });
}

/// K16: an own page behind the admin login, inside the kit's layout.
fn register_pages(app: &mut App, messages: &Messages, stored: &Gauge) {
    app.nav_entry("Messages", "/messages");
    app.dashboard_routes(
        Router::new()
            .route("/messages", get(messages_page))
            .with_state(messages.clone())
            .route("/messages/clear", post(clear_messages))
            .with_state((messages.clone(), stored.clone()))
            .route("/messages/count", post(count_messages))
            .with_state(messages.clone()),
    );
}

/// K21: before a binary swap, the kit asks for a consistent copy of the state.
fn register_state_copy(app: &mut App, messages: Messages) {
    app.state_copy(move |dest| {
        let snapshot = serde_json::to_vec_pretty(&*messages.lock().expect("messages lock"))
            .map_err(|e| {
                chassis::Error::internal(format!("serialise messages: {e}"), "report this")
            })?;
        std::fs::write(dest.join("messages.json"), snapshot).map_err(|e| {
            chassis::Error::config(
                format!("cannot write the pre-update copy: {e}"),
                "check the copies directory's permissions",
            )
        })
    });
}
