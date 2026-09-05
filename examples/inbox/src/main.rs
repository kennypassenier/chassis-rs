//! inbox — the example service that proves the kit (K26).
//!
//! Clients post JSON messages with their token; the kit supplies login,
//! clients, tokens, the last-requests view, self-update and notifications.
//! Each received message is a project event (`message.received`), so a
//! configured webhook hears about it. The dashboard page that lists the
//! messages is assembled in L7.

#![forbid(unsafe_code)]

use std::sync::{Arc, Mutex};

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use chassis::shell::clients_api::ClientView;
use chassis::shell::dashboard::{ClientColumn, Section, StatusSection};
use chassis::shell::notify::Notifier;
use chassis::{App, AppSpec, Caller};

/// Messages received so far, newest last. In memory: the example proves
/// the kit, not a database.
type Messages = Arc<Mutex<Vec<serde_json::Value>>>;

#[derive(Clone)]
struct Inbox {
    messages: Messages,
    notifier: Notifier,
}

/// The status page shows how many messages arrived and the last five (K17).
struct MessagesSection(Messages);

impl StatusSection for MessagesSection {
    fn render(&self) -> Section {
        let all = self.0.lock().expect("messages lock");
        let mut rows: Vec<(String, String)> = vec![("Received".into(), all.len().to_string())];
        for (i, m) in all.iter().rev().take(5).enumerate() {
            rows.push((
                format!("#{}", all.len() - i),
                format!("{} → {}", m["from"].as_str().unwrap_or("?"), m["body"]),
            ));
        }
        Section {
            title: "Messages".into(),
            explain: "Everything clients posted to /v1/messages since the service started; the newest five are listed.".into(),
            rows,
            html: None,
        }
    }
}

/// Each client's row on the Clients page gains a "messages" column (K16).
struct MessagesColumn(Messages);

impl ClientColumn for MessagesColumn {
    fn title(&self) -> String {
        "Messages".into()
    }
    fn cell(&self, client: &ClientView) -> String {
        let n = self
            .0
            .lock()
            .expect("messages lock")
            .iter()
            .filter(|m| m["from"].as_str() == Some(client.name.as_str()))
            .count();
        n.to_string()
    }
}

async fn receive(
    State(inbox): State<Inbox>,
    caller: Caller,
    Json(body): Json<serde_json::Value>,
) -> (axum::http::StatusCode, Json<serde_json::Value>) {
    let from = match &caller {
        Caller::Client { name, .. } => name.clone(),
        Caller::Admin => "admin".to_string(),
    };
    let id = {
        let mut all = inbox.messages.lock().expect("messages lock");
        all.push(serde_json::json!({ "from": from, "body": body }));
        all.len()
    };
    inbox.notifier.emit(
        "message.received",
        env!("CARGO_PKG_VERSION"),
        format!("#{id} from {from}"),
    );
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
        // Releases of the example live with the kit; set update_url to
        // point somewhere else (a drill server, for instance).
        repository: Some("kennypassenier/chassis-rs"),
        ..Default::default()
    };
    // No public routes: `/` is the kit's status page, `/v1/messages` needs a token.
    let mut app = match App::from_env_and_args(spec, Router::new()) {
        Ok(app) => app,
        Err(e) => {
            eprintln!("{e}");
            return std::process::ExitCode::FAILURE;
        }
    };
    let messages: Messages = Arc::new(Mutex::new(Vec::new()));
    let inbox = Inbox {
        messages: messages.clone(),
        notifier: app.notifier(),
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
    app.status_section(MessagesSection(messages.clone()));
    app.client_column(MessagesColumn(messages.clone()));
    // K21: before a binary swap, the kit asks for a consistent copy of the state.
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
    app.run().await
}
